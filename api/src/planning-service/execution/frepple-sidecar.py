"""Minimal HTTP runtime for the fixed enLearn frePPLe bridge."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import json
import os
import re
import select
import signal
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid


BRIDGE_PATH = os.path.abspath(os.environ.get(
    "PLANNING_FREPPLE_BRIDGE",
    os.path.join(os.path.dirname(__file__), "frepple-engine.py"),
))
EXECUTABLE = os.environ.get("PLANNING_FREPPLE_EXECUTABLE", "/usr/bin/frepple")
HOST = os.environ.get("PLANNING_SIDECAR_HOST", "0.0.0.0")
PORT = int(os.environ.get("PLANNING_SIDECAR_PORT", "8080"))
TOKEN = os.environ.get("PLANNING_ENGINE_TOKEN", "")
MAX_REQUEST_BYTES = int(os.environ.get("PLANNING_SIDECAR_MAX_REQUEST_BYTES", str(256 * 1024 * 1024)))
MAX_RESPONSE_BYTES = int(os.environ.get("PLANNING_SIDECAR_MAX_RESPONSE_BYTES", str(256 * 1024 * 1024)))
TIMEOUT_SECONDS = int(os.environ.get("PLANNING_SIDECAR_TIMEOUT_SECONDS", "3600"))
MAX_LOG_BYTES = int(os.environ.get("PLANNING_SIDECAR_MAX_LOG_BYTES", str(10 * 1024 * 1024)))
CANCEL_GRACE_SECONDS = float(os.environ.get("PLANNING_SIDECAR_CANCEL_GRACE_SECONDS", "2"))
TEST_DELAY_SECONDS = max(0.0, float(os.environ.get("PLANNING_SIDECAR_TEST_DELAY_SECONDS", "0")))
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")


class RequestError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class ExecutionCanceled(Exception):
    pass


class ExecutionState:
    def __init__(self):
        self._lock = threading.Lock()
        self._process = None
        self._canceled = False
        self._terminating = False

    def attach(self, process):
        with self._lock:
            self._process = process
            if self._canceled and not self._terminating:
                self._terminating = True
                return True
            return False

    def cancel(self):
        process = None
        with self._lock:
            self._canceled = True
            if self._process is not None and not self._terminating:
                self._terminating = True
                process = self._process
        if process is not None:
            terminate_process_tree(process)

    def is_canceled(self):
        with self._lock:
            return self._canceled


class ExecutionRegistry:
    def __init__(self):
        self._lock = threading.Lock()
        self._states = {}

    def begin(self, request_id):
        with self._lock:
            if request_id in self._states:
                raise RequestError(409, "request id is already active")
            state = ExecutionState()
            self._states[request_id] = state
            return state

    def cancel(self, request_id):
        with self._lock:
            state = self._states.get(request_id)
        if state is None:
            return False
        state.cancel()
        return True

    def finish(self, request_id, state):
        with self._lock:
            if self._states.get(request_id) is state:
                del self._states[request_id]

    def count(self):
        with self._lock:
            return len(self._states)


EXECUTIONS = ExecutionRegistry()


class Handler(BaseHTTPRequestHandler):
    server_version = "enlearn-frepple-sidecar/1"

    def do_GET(self):
        if self.path != "/health":
            self._json(404, {"error": "not found"})
            return
        available = os.path.isfile(BRIDGE_PATH) and os.path.isfile(EXECUTABLE)
        self._json(200 if available else 503, {
            "available": available,
            "bridge": "enlearn-frepple-v1",
            "cancellation": "request-id-v1",
            "active": EXECUTIONS.count(),
        })

    def do_POST(self):
        if self.path == "/cancel":
            self._cancel()
            return
        if self.path != "/solve":
            self._json(404, {"error": "not found"})
            return
        try:
            self._authorize()
            request_id = self._request_id(required=False)
            request = self._request_json(MAX_REQUEST_BYTES)
            for field in ("model", "parameters", "bucketDates", "bucketizedResources"):
                if field not in request:
                    raise RequestError(400, "missing request field %s" % field)
            result = solve(request, request_id, self._client_disconnected)
            self._json_bytes(200, result)
        except RequestError as error:
            self._json(error.status, {"error": str(error)})
        except ExecutionCanceled:
            self._json(409, {"error": "frePPLe execution canceled"})
        except subprocess.TimeoutExpired:
            self._json(504, {"error": "frePPLe execution timed out"})
        except Exception as error:
            self._json(500, {"error": str(error)[:4096]})

    def _cancel(self):
        try:
            self._authorize()
            body = self._request_json(4096)
            request_id = body.get("requestId")
            if not isinstance(request_id, str) or not REQUEST_ID_PATTERN.fullmatch(request_id):
                raise RequestError(400, "invalid request id")
            canceled = EXECUTIONS.cancel(request_id)
            self._json(200, {"canceled": canceled, "requestId": request_id})
        except RequestError as error:
            self._json(error.status, {"error": str(error)})
        except Exception as error:
            self._json(500, {"error": str(error)[:4096]})

    def _authorize(self):
        if not TOKEN:
            return
        expected = "Bearer %s" % TOKEN
        actual = self.headers.get("Authorization", "")
        if not hmac.compare_digest(actual, expected):
            raise RequestError(401, "unauthorized")

    def _request_id(self, required):
        request_id = self.headers.get("X-Planning-Request-Id", "").strip()
        if not request_id and not required:
            return uuid.uuid4().hex
        if not REQUEST_ID_PATTERN.fullmatch(request_id):
            raise RequestError(400, "invalid X-Planning-Request-Id")
        return request_id

    def _request_json(self, max_bytes):
        raw_length = self.headers.get("Content-Length")
        if raw_length is None:
            raise RequestError(411, "Content-Length is required")
        try:
            length = int(raw_length)
        except ValueError as error:
            raise RequestError(400, "invalid Content-Length") from error
        if length <= 0 or length > max_bytes:
            raise RequestError(413, "request body is too large")
        try:
            value = json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RequestError(400, "request body must be valid JSON") from error
        if not isinstance(value, dict):
            raise RequestError(400, "request body must be a JSON object")
        return value

    def _client_disconnected(self):
        try:
            readable, _, _ = select.select([self.connection], [], [], 0)
            if not readable:
                return False
            return self.connection.recv(1, socket.MSG_PEEK) == b""
        except (OSError, ValueError):
            return True

    def _json(self, status, value):
        self._json_bytes(status, json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8"))

    def _json_bytes(self, status, body):
        if len(body) > MAX_RESPONSE_BYTES:
            status = 500
            body = b'{"error":"frePPLe response is too large"}'
        try:
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, format_value, *args):
        print("%s - %s" % (self.address_string(), format_value % args), flush=True)


def solve(request, request_id=None, disconnected=None):
    request_id = request_id or uuid.uuid4().hex
    directory = tempfile.mkdtemp(prefix="enlearn-frepple-sidecar-")
    request_path = os.path.join(directory, "request.json")
    model_path = os.path.join(directory, "model.json")
    output_path = os.path.join(directory, "result.json")
    try:
        with open(request_path, "w", encoding="utf-8") as output:
            json.dump({
                "bucketDates": request["bucketDates"],
                "bucketizedResources": request["bucketizedResources"],
                "parameters": request["parameters"],
            }, output, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        with open(model_path, "w", encoding="utf-8") as output:
            json.dump(request["model"], output, ensure_ascii=False, separators=(",", ":"), allow_nan=False)

        environment = {
            key: value for key, value in os.environ.items()
            if not is_blocked_environment_key(key)
        }
        environment.update({
            "ENLEARN_FREPPLE_REQUEST": request_path,
            "ENLEARN_FREPPLE_MODEL": model_path,
            "ENLEARN_FREPPLE_OUTPUT": output_path,
        })
        if TEST_DELAY_SECONDS > 0:
            environment["ENLEARN_FREPPLE_TEST_DELAY_SECONDS"] = str(TEST_DELAY_SECONDS)
        returncode, output = run_command(
            [EXECUTABLE, BRIDGE_PATH],
            TIMEOUT_SECONDS,
            request_id=request_id,
            disconnected=disconnected,
            environment=environment,
            cwd=directory,
        )
        logs = output[-MAX_LOG_BYTES:].decode("utf-8", errors="replace").strip()
        if returncode:
            raise RuntimeError(
                "frePPLe exited with code %s%s" % (
                    returncode,
                    ": %s" % logs[-4096:] if logs else "",
                )
            )
        if not os.path.isfile(output_path):
            raise RuntimeError("frePPLe bridge did not produce a result file")
        if os.path.getsize(output_path) > MAX_RESPONSE_BYTES:
            raise RuntimeError("frePPLe response is too large")
        with open(output_path, "rb") as source:
            return source.read()
    finally:
        shutil.rmtree(directory, ignore_errors=True)


def run_command(
    command,
    timeout_seconds,
    request_id=None,
    disconnected=None,
    environment=None,
    cwd=None,
):
    request_id = request_id or uuid.uuid4().hex
    state = EXECUTIONS.begin(request_id)
    try:
        process = subprocess.Popen(
            command,
            cwd=cwd,
            env=environment,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        if state.attach(process):
            terminate_process_tree(process)
        deadline = time.monotonic() + timeout_seconds
        output = b""
        while True:
            if state.is_canceled():
                terminate_process_tree(process)
                output, _ = process.communicate()
                raise ExecutionCanceled()
            if disconnected is not None and disconnected():
                state.cancel()
                output, _ = process.communicate()
                raise ExecutionCanceled()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                terminate_process_tree(process)
                output, _ = process.communicate()
                raise subprocess.TimeoutExpired(command, timeout_seconds, output=output)
            try:
                output, _ = process.communicate(timeout=min(0.25, remaining))
                # Cancellation can terminate the process between the state check above
                # and communicate returning. Preserve cancellation semantics in that race.
                if state.is_canceled():
                    raise ExecutionCanceled()
                return process.returncode, output
            except subprocess.TimeoutExpired:
                continue
    finally:
        EXECUTIONS.finish(request_id, state)


def terminate_process_tree(process):
    if process.poll() is not None:
        return
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        try:
            process.terminate()
        except ProcessLookupError:
            return
    deadline = time.monotonic() + CANCEL_GRACE_SECONDS
    while process.poll() is None and time.monotonic() < deadline:
        time.sleep(0.05)
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            try:
                process.kill()
            except ProcessLookupError:
                pass


def is_blocked_environment_key(key):
    upper = key.upper()
    return (
        upper in ("DATABASE_URL", "DIRECT_URL")
        or upper.startswith("PG")
        or upper.startswith("SUPABASE_")
        or upper.startswith("NEXT_PUBLIC_SUPABASE_")
        or upper.startswith("REDIS_")
        or upper.startswith("TRIGGER_")
    )


def main():
    if not os.path.isfile(BRIDGE_PATH):
        raise RuntimeError("frePPLe bridge was not found: %s" % BRIDGE_PATH)
    if not os.path.isfile(EXECUTABLE):
        raise RuntimeError("frePPLe executable was not found: %s" % EXECUTABLE)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print("enLearn frePPLe sidecar listening on %s:%s" % (HOST, PORT), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
