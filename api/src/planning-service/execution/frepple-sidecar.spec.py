import os
import subprocess
import sys
import threading
import time
import unittest


os.environ.setdefault("PLANNING_FREPPLE_EXECUTABLE", sys.executable)
sys.path.insert(0, os.path.dirname(__file__))

import importlib.util


SPEC = importlib.util.spec_from_file_location(
    "frepple_sidecar",
    os.path.join(os.path.dirname(__file__), "frepple-sidecar.py"),
)
sidecar = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sidecar)


class SidecarCancellationTests(unittest.TestCase):
    def setUp(self):
        self.previous_grace = sidecar.CANCEL_GRACE_SECONDS
        sidecar.CANCEL_GRACE_SECONDS = 0.05

    def tearDown(self):
        sidecar.CANCEL_GRACE_SECONDS = self.previous_grace

    def test_cancel_endpoint_state_terminates_process_group(self):
        request_id = "sidecar-cancel-explicit"
        result = {}

        def execute():
            try:
                sidecar.run_command(
                    [sys.executable, "-c", "import time; time.sleep(60)"],
                    60,
                    request_id=request_id,
                )
            except BaseException as error:
                result["error"] = error

        thread = threading.Thread(target=execute)
        thread.start()
        self.assertTrue(wait_for(lambda: sidecar.EXECUTIONS.count() == 1))
        self.assertTrue(sidecar.EXECUTIONS.cancel(request_id))
        thread.join(5)
        self.assertFalse(thread.is_alive())
        self.assertIsInstance(result.get("error"), sidecar.ExecutionCanceled)
        self.assertEqual(sidecar.EXECUTIONS.count(), 0)

    def test_disconnected_client_terminates_process_group(self):
        result = {}

        def execute():
            try:
                sidecar.run_command(
                    [sys.executable, "-c", "import time; time.sleep(60)"],
                    60,
                    request_id="sidecar-cancel-disconnect",
                    disconnected=lambda: True,
                )
            except BaseException as error:
                result["error"] = error

        thread = threading.Thread(target=execute)
        thread.start()
        thread.join(5)
        self.assertFalse(thread.is_alive())
        self.assertIsInstance(result.get("error"), sidecar.ExecutionCanceled)
        self.assertEqual(sidecar.EXECUTIONS.count(), 0)

    def test_cancel_during_communicate_preserves_canceled_result(self):
        request_id = "sidecar-cancel-communicate-race"
        attached = threading.Event()
        release = threading.Event()
        result = {}
        original_popen = sidecar.subprocess.Popen

        class FakeProcess:
            pid = 12345
            returncode = 15

            def poll(self):
                return self.returncode

            def communicate(self, timeout=None):
                attached.set()
                release.wait(2)
                return b"terminated", None

        sidecar.subprocess.Popen = lambda *args, **kwargs: FakeProcess()
        try:
            def execute():
                try:
                    sidecar.run_command(
                        [sys.executable, "-c", "pass"],
                        60,
                        request_id=request_id,
                    )
                except BaseException as error:
                    result["error"] = error

            thread = threading.Thread(target=execute)
            thread.start()
            self.assertTrue(attached.wait(2))
            self.assertTrue(sidecar.EXECUTIONS.cancel(request_id))
            release.set()
            thread.join(5)
            self.assertFalse(thread.is_alive())
            self.assertIsInstance(result.get("error"), sidecar.ExecutionCanceled)
            self.assertEqual(sidecar.EXECUTIONS.count(), 0)
        finally:
            release.set()
            sidecar.subprocess.Popen = original_popen

    def test_timeout_terminates_process_group(self):
        started = time.monotonic()
        with self.assertRaises(subprocess.TimeoutExpired):
            sidecar.run_command(
                [sys.executable, "-c", "import time; time.sleep(60)"],
                0.05,
                request_id="sidecar-timeout-test",
            )
        self.assertLess(time.monotonic() - started, 5)
        self.assertEqual(sidecar.EXECUTIONS.count(), 0)


def wait_for(predicate, timeout=5):
    deadline = time.monotonic() + timeout
    while not predicate():
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.01)
    return True


if __name__ == "__main__":
    unittest.main()
