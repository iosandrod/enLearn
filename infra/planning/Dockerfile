FROM ghcr.io/frepple/frepple-community:9.17.0

COPY --chown=frepple:frepple api/src/planning-service/execution/frepple-engine.py /opt/enlearn/frepple-engine.py
COPY --chown=frepple:frepple api/src/planning-service/execution/frepple-sidecar.py /opt/enlearn/frepple-sidecar.py

ENV PLANNING_FREPPLE_BRIDGE=/opt/enlearn/frepple-engine.py \
    PLANNING_FREPPLE_EXECUTABLE=/usr/bin/frepple \
    PLANNING_SIDECAR_HOST=0.0.0.0 \
    PLANNING_SIDECAR_PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD curl --fail --silent http://127.0.0.1:8080/health >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/python3", "/opt/enlearn/frepple-sidecar.py"]
