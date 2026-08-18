"""Fixed frePPLe bridge for enLearn planning execution.

The bridge only exchanges JSON files with the TypeScript worker. It never
opens an application database connection.
"""

from datetime import datetime, timezone
import json
import math
import os
import sys
import tempfile
import time

import frepple


_EXPORTED_OPERATION_PLAN_STATUSES = {
    "proposed",
    "approved",
    "confirmed",
    "completed",
    "closed",
}


def _required_path(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError("Missing required environment variable %s" % name)
    return os.path.abspath(value)


def _date(value):
    if value is None:
        return None
    parsed = value
    if not isinstance(parsed, datetime):
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError as error:
            raise RuntimeError("Invalid frePPLe date value %s" % value) from error
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)
    return parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _name(value):
    return getattr(value, "name", None) if value is not None else None


def _reference(value):
    return getattr(value, "reference", None) if value is not None else None


def _number(value):
    if value is None:
        return None
    result = float(value)
    if not math.isfinite(result):
        return None
    return result


def _operation_plan_type(opplan):
    operation = opplan.operation
    if isinstance(operation, frepple.operation_inventory):
        return "STCK"
    if isinstance(operation, frepple.operation_itemdistribution):
        return "DO"
    if isinstance(operation, frepple.operation_itemsupplier):
        return "PO"
    if not operation.hidden:
        if opplan.owner and isinstance(opplan.owner.operation, frepple.operation_routing):
            return "WO"
        return "MO"
    if opplan.demand or (opplan.owner and opplan.owner.demand):
        return "DLVR"
    return None


def _operation_plan_demand(opplan):
    if opplan.demand:
        return opplan.demand
    if opplan.owner and opplan.owner.demand:
        return opplan.owner.demand
    return None


def _operation_plan_row(opplan):
    if str(opplan.status) not in _EXPORTED_OPERATION_PLAN_STATUSES:
        return None
    order_type = _operation_plan_type(opplan)
    if not order_type or not opplan.reference:
        return None

    operation = opplan.operation
    demand = _operation_plan_demand(opplan)
    item = getattr(operation, "item", None)
    location = getattr(operation, "location", None)
    origin = None
    destination = None
    supplier = None

    if isinstance(operation, frepple.operation_inventory):
        item = operation.buffer.item
        location = operation.buffer.location
    elif isinstance(operation, frepple.operation_itemdistribution):
        origin_buffer = operation.origin
        destination_buffer = operation.destination
        item = (destination_buffer or origin_buffer).item
        origin = origin_buffer.location if origin_buffer else None
        destination = destination_buffer.location if destination_buffer else None
        location = destination
    elif isinstance(operation, frepple.operation_itemsupplier):
        item = operation.buffer.item
        location = operation.buffer.location
        supplier = operation.itemsupplier.supplier
    elif order_type == "DLVR" and demand:
        item = demand.item
        location = demand.location

    color = None
    if order_type not in ("STCK", "DLVR") and not demand:
        raw_color = opplan.getColor()[0]
        if raw_color != 999999:
            color = _number(raw_color)

    owner = None
    if opplan.owner and not opplan.owner.operation.hidden:
        owner = opplan.owner.reference

    return {
        "reference": str(opplan.reference),
        "type": order_type,
        "status": str(opplan.status),
        "quantity": _number(opplan.quantity),
        "quantityCompleted": _number(opplan.quantity_completed),
        "start": _date(opplan.start),
        "end": _date(opplan.end),
        "criticality": _number(opplan.criticality),
        "delay": _number(opplan.delay),
        "operation": None if order_type in ("STCK", "PO", "DO", "DLVR") else operation.name,
        "owner": owner,
        "item": _name(item),
        "origin": _name(origin),
        "destination": _name(destination),
        "supplier": _name(supplier),
        "location": _name(location),
        "demand": _name(demand),
        "due": _date(demand.due) if demand else None,
        "name": _name(operation),
        "batch": str(opplan.batch) if opplan.batch else None,
        "remark": str(opplan.remark) if opplan.remark else None,
        "color": color,
    }


def _operation_plans():
    rows = []
    references = set()
    for opplan in frepple.operationplans():
        row = _operation_plan_row(opplan)
        if row:
            rows.append(row)
            references.add(row["reference"])
    return rows, references


def _operation_plan_materials(exported_references):
    rows = []
    for buffer in frepple.buffers():
        for flowplan in buffer.flowplans:
            reference = _reference(flowplan.operationplan)
            if (
                not flowplan.quantity
                or not reference
                or str(reference) not in exported_references
            ):
                continue
            rows.append({
                "operationPlanReference": str(reference),
                "item": buffer.item.name,
                "location": buffer.location.name,
                "quantity": _number(flowplan.quantity),
                "date": _date(flowplan.date),
                "onhand": _number(flowplan.onhand),
                "minimum": _number(flowplan.minimum),
                "periodOfCover": _number(flowplan.period_of_cover),
                "status": str(flowplan.status),
            })
    return rows


def _operation_plan_resources(exported_references):
    rows = []
    for resource in frepple.resources():
        for loadplan in resource.loadplans:
            reference = _reference(loadplan.operationplan)
            if (
                loadplan.quantity >= 0
                or not reference
                or str(reference) not in exported_references
            ):
                continue
            rows.append({
                "operationPlanReference": str(reference),
                "resource": resource.name,
                "quantity": _number(-loadplan.quantity),
                "setup": str(loadplan.setup) if loadplan.setup else None,
                "status": str(loadplan.status),
            })
    return rows


def _problem_owner(problem):
    owner = problem.owner
    if isinstance(owner, frepple.operationplan):
        owner = owner.operation
    return owner


def _problems():
    return [{
        "entity": str(problem.entity),
        "name": str(problem.name),
        "owner": _name(_problem_owner(problem)),
        "description": str(problem.description),
        "start": _date(problem.start),
        "end": _date(problem.end),
    } for problem in frepple.problems()]


def _constraints():
    rows = []
    for demand in frepple.demands():
        for constraint in demand.constraints:
            owner = constraint.owner
            if isinstance(owner, frepple.operationplan):
                owner = owner.operation
            is_default = isinstance(demand, frepple.demand_default)
            rows.append({
                "demand": demand.name if is_default else None,
                "forecast": None if is_default else _name(getattr(demand, "owner", None)) or demand.name,
                "item": _name(getattr(demand, "item", None)),
                "entity": str(constraint.entity),
                "name": str(constraint.name),
                "owner": _name(owner),
                "description": str(constraint.description),
                "start": _date(constraint.start),
                "end": _date(constraint.end),
            })
    return rows


def _parse_bucket(value):
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _resource_plans(bucket_dates):
    if not bucket_dates:
        return []
    buckets = [_parse_bucket(value) for value in bucket_dates]
    rows = []
    for resource in frepple.resources():
        for plan in resource.plan(buckets):
            rows.append({
                "resource": resource.name,
                "start": _date(plan["start"]),
                "available": _number(plan["available"]),
                "unavailable": _number(plan["unavailable"]),
                "setup": _number(plan["setup"]),
                "load": _number(plan["load"]),
                "free": _number(plan["free"]),
                "loadConfirmed": _number(plan["load_confirmed"]),
            })
    return rows


def _engine_references():
    buffers = []
    for buffer in frepple.buffers():
        if not buffer.item or not buffer.location:
            continue
        buffers.append({
            "name": buffer.name,
            "item": buffer.item.name,
            "location": buffer.location.name,
            "batch": str(buffer.batch) if buffer.batch else None,
        })

    operations = []
    for operation in frepple.operations():
        suboperations = getattr(operation, "suboperations", ())
        operations.append({
            "name": operation.name,
            "hidden": bool(operation.hidden),
            "buffers": sorted(set(
                flow.buffer.name for flow in operation.flows if flow.buffer
            )),
            "resources": sorted(set(
                load.resource.name for load in operation.loads if load.resource
            )),
            "suboperations": sorted(set(
                suboperation.operation.name
                for suboperation in suboperations
                if suboperation.operation
            )),
        })
    return {
        "buffers": buffers,
        "demands": sorted(set(demand.name for demand in frepple.demands())),
        "operations": operations,
    }


def _write_json_atomic(path, value):
    directory = os.path.dirname(path)
    descriptor, temporary = tempfile.mkstemp(prefix="frepple-result-", suffix=".json", dir=directory)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(value, output, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def main():
    request_path = _required_path("ENLEARN_FREPPLE_REQUEST")
    model_path = _required_path("ENLEARN_FREPPLE_MODEL")
    output_path = _required_path("ENLEARN_FREPPLE_OUTPUT")
    with open(request_path, "r", encoding="utf-8") as source:
        request = json.load(source)

    test_delay = max(0.0, float(os.environ.get(
        "ENLEARN_FREPPLE_TEST_DELAY_SECONDS", "0"
    )))
    if test_delay:
        time.sleep(test_delay)

    frepple.readJSONfile(model_path)
    frepple.settings.suppressFlowplanCreation = False

    for conversion in request.get("bucketizedResources", []):
        resource = frepple.resource(name=conversion["resource"])
        calendar = frepple.calendar(name=conversion["calendar"], action="C")
        resource.computeAvailability(calendar, False)

    parameters = request["parameters"]
    solver = frepple.solver_mrp(
        constraints=parameters["constraints"],
        plantype=parameters["planType"],
        loglevel=parameters["logLevel"],
        lazydelay=parameters["lazyDelay"],
        minimumdelay=parameters["minimumDelay"],
        rotateresources=parameters["rotateResources"],
        iterationmax=parameters["iterationMax"],
        resourceiterationmax=parameters["resourceIterationMax"],
        administrativeleadtime=parameters["administrativeLeadtime"],
        autofence=parameters["autoFence"],
        algorithm=parameters["algorithm"],
    )
    solver.solve()
    frepple.solver_propagateStatus(loglevel=parameters["logLevel"]).solve()
    for opplan in frepple.operationplans():
        opplan.updateFeasible()

    operation_plans, exported_references = _operation_plans()
    result = {
        "operationPlans": operation_plans,
        "operationPlanMaterials": _operation_plan_materials(exported_references),
        "operationPlanResources": _operation_plan_resources(exported_references),
        "problems": _problems(),
        "constraints": _constraints(),
        "resourcePlans": _resource_plans(request.get("bucketDates", [])),
        "engine": {
            "bridge": "enlearn-frepple-v1",
            "python": sys.version.split()[0],
            "references": _engine_references(),
        },
    }
    _write_json_atomic(output_path, result)


if __name__ == "__main__":
    main()
