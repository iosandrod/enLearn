import assert from "node:assert/strict";
import { Date as PlanningDate, DateRange, DateTime, Duration } from "../dist/utils/date.js";
import { CommandList, CommandManager, CommandSetProperty } from "../dist/utils/actions.js";
import { Cache, CacheEntry } from "../dist/utils/cache.js";
import { DatabaseStatement, DatabaseTransaction } from "../dist/utils/database.js";
import { JSONData, JSONInputString, JSONSerializerString } from "../dist/utils/json.js";
import { HeaderModelAdapter, Keyword } from "../dist/utils/library.js";
import { Object as FreppleObject, PythonData, PythonDataValueDict } from "../dist/utils/python.js";
import { XMLInputString, XMLSerializerString } from "../dist/utils/xml.js";
import { FreppleInitialize, FreppleReadXMLData, FreppleVersion } from "../dist/dllmain.js";
import { Plan } from "../dist/model/plan.js";
import { Buffer, BufferInfinite } from "../dist/model/buffer.js";
import { Calendar, CalendarBucket, CalendarDefault } from "../dist/model/calendar.js";
import { Customer, CustomerDefault } from "../dist/model/customer.js";
import { Demand, DemandDefault, DemandGroup } from "../dist/model/demand.js";
import { Item, ItemMTO, ItemMTS } from "../dist/model/item.js";
import { ItemDistribution, OperationItemDistribution } from "../dist/model/itemdistribution.js";
import { ItemSupplier, OperationItemSupplier } from "../dist/model/itemsupplier.js";
import {
  Load,
  LoadDefault,
  LoadBucketizedPercentage,
  LoadBucketizedFromStart,
  LoadBucketizedFromEnd,
} from "../dist/model/load.js";
import { Location, LocationDefault } from "../dist/model/location.js";
import { Operation, OperationAlternate, OperationFixedTime, OperationRouting } from "../dist/model/operation.js";
import { OperationPlan } from "../dist/model/operationplan.js";
import { SubOperation, SubOperationIterator } from "../dist/model/suboperation.js";
import {
  OperationDependency,
  OperationDependencyIterator,
  OperationPlanDependency,
  OperationPlanDependencyIterator,
} from "../dist/model/operationdependency.js";
import {
  CommandCreateOperationPlan,
  CommandDeleteOperationPlan,
  CommandMoveOperationPlan,
} from "../dist/model/actions.js";
import { Resource, ResourceBuckets, ResourceDefault, ResourceInfinite } from "../dist/model/resource.js";
import { ResourceSkill } from "../dist/model/resourceskill.js";
import { Skill, SkillDefault } from "../dist/model/skill.js";
import { Supplier, SupplierDefault } from "../dist/model/supplier.js";
import { SetupMatrix, SetupMatrixDefault, SetupMatrixRuleDefault } from "../dist/model/setupmatrix.js";
import { FlowEnd, FlowStart } from "../dist/model/flow.js";
import {
  FlowPlan,
  TimeLine,
  TimeLineEventChangeOnhand,
  TimeLineEventMaxQuantity,
  TimeLineEventMinQuantity,
  TimeLineEventSetOnhand,
} from "../dist/model/flowplan.js";
import { LoadPlan, LoadPlanIterator } from "../dist/model/loadplan.js";
import { PeggingDemandIterator, PeggingIterator, PeggingIteratorState } from "../dist/model/pegging.js";
import { HasLevel } from "../dist/model/leveled.js";
import { Problem } from "../dist/model/problem.js";
import { ProblemMaterialShortage } from "../dist/model/problems_buffer.js";
import { ProblemCapacityOverload } from "../dist/model/problems_resource.js";
import { ProblemInvalidData, ProblemPrecedence } from "../dist/model/problems_operationplan.js";
import {
  SolverCreate,
  SolverCreateSolverData,
  SolverCreateState,
  SolverPropagateStatus,
} from "../dist/solver/solverplan.js";
import { hasOperationPlansSemantic, scanExcessSemantic } from "../dist/solver/solverdemand.js";
import { OperatorForward } from "../dist/solver/operatorforward.js";
import { OperatorBackward } from "../dist/solver/operatorbackward.js";
import { OperatorDelete } from "../dist/solver/operatordelete.js";
import {
  crostonForecast,
  detectSeasonalCycle,
  discreteCarryover,
  doubleExponentialForecast,
  manualForecast,
  movingAverageForecast,
  seasonalForecast,
  singleExponentialForecast,
  standardDeviation,
  weightedSmape,
} from "../dist/forecast/timeseries.js";
import { Forecast } from "../dist/forecast/forecast.js";
import { Measures } from "../dist/forecast/measure.js";
import {
  ForecastSolver,
  ForecastSolverManual,
  ProblemOutlier,
} from "../dist/forecast/forecastsolver.js";

const movingAverageResult = movingAverageForecast([10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  { futurePeriods: 4, skip: 5 });
assert.deepEqual(movingAverageResult.values, [10, 10, 10, 10]);
assert.equal(movingAverageResult.metrics.smape, 0);

const singleResult = singleExponentialForecast([2, 4, 6, 8, 10, 10, 10, 10, 10, 10, 10, 10],
  { futurePeriods: 3, skip: 2 });
assert.equal(singleResult.values.length, 3);
assert.ok(singleResult.values[0] > 9);

const trendResult = doubleExponentialForecast([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  { futurePeriods: 3, skip: 2 });
assert.equal(trendResult.values.length, 3);
assert.ok(trendResult.values[1] > trendResult.values[0]);

const seasonalHistory = [3, 9, 5, 12, 3, 9, 5, 12, 3, 9, 5, 12, 3, 9, 5, 12];
const cycle = detectSeasonalCycle(seasonalHistory, 2, 6);
assert.equal(cycle.period, 4);
assert.ok(cycle.autocorrelation > 0.99);
const seasonalResult = seasonalForecast(seasonalHistory, { futurePeriods: 4, skip: 2, minPeriod: 2, maxPeriod: 6 });
assert.equal(seasonalResult.parameters.period, 4);
assert.equal(seasonalResult.values.length, 4);
assert.ok(seasonalResult.values[1] > seasonalResult.values[0]);

const crostonResult = crostonForecast([5, 0, 0, 0, 4, 0, 0, 6, 0, 0, 0, 0],
  { futurePeriods: 3, skip: 2 });
assert.equal(crostonResult.values.length, 3);
assert.ok(crostonResult.values.every((value) => value >= 0));
assert.deepEqual(manualForecast([1, 2, 3], { futurePeriods: 3 }).values, [0, 0, 0]);
assert.equal(weightedSmape([4, 4], [4, 4], 0), 0);
assert.equal(standardDeviation([1, 2, 3], [1, 2, 3]), 0);
const discrete = discreteCarryover([0.4, 0.4, 0.4, 0.4, 0.4]);
assert.equal(discrete.reduce((total, value) => total + value, 0), 2);

assert.equal(new Duration("P1M1WT1H").seconds, 3_236_400);
assert.equal(Duration.parse2double("PT1.125S"), 1.125);
assert.equal(new Duration(-90).toString(), "-PT1M30S");

const start = new DateTime("2025-01-01T00:00:00");
const end = start.add(new Duration("P1D"));
assert.equal(end.subtract(start).seconds, 86_400);
assert.equal(new DateRange(start, end).overlap(new DateRange(start.add(new Duration(3600)), end)).seconds, 82_800);

const target = { quantity: 10 };
const list = new CommandList();
list.add(new CommandSetProperty(target, "quantity", 25));
assert.equal(target.quantity, 25);
list.rollback();
assert.equal(target.quantity, 10);

const manager = new CommandManager();
const bookmark = manager.setBookmark();
manager.add(new CommandSetProperty(target, "quantity", 30));
manager.rollback(bookmark);
assert.equal(target.quantity, 10);

const pythonNumber = new PythonData("42");
assert.equal(pythonNumber.getInt(), 42);
assert.equal(new PythonData(new Duration(90)).getDuration().seconds, 90);
const dictionary = new PythonDataValueDict(new Map([["answer", 42]]));
assert.equal(dictionary.get(new Keyword("answer"))?.getInt(), 42);

const entity = new FreppleObject();
entity.setStringProperty("name", "demo");
entity.setDoubleProperty("quantity", 12.5);
entity.setHidden(true);
assert.equal(entity.hasProperty("name"), true);
assert.equal(entity.getDoubleProperty("quantity"), 12.5);
assert.equal(entity.deleteProperty("quantity"), true);

const jsonNumber = new JSONData("17");
assert.equal(jsonNumber.getInt(), 17);
const jsonSerializer = new JSONSerializerString();
jsonSerializer.setFormatted(true);
jsonSerializer.writeObject("entity", entity);
const jsonText = jsonSerializer.getData();
assert.deepEqual(new JSONInputString(jsonText).parse(null), { entity: { name: "demo" } });

const xmlSerializer = new XMLSerializerString();
xmlSerializer.writeObject("entity", entity);
const xmlText = xmlSerializer.getData();
assert.match(xmlText, /<name>demo<\/name>/);
assert.deepEqual(new XMLInputString(xmlText).parse(), { entity: { name: "demo" } });
assert.deepEqual(new XMLInputString("<?python raise Exception()?>\n<root><value>ok</value></root>").parse(), { root: { value: "ok" } });

const successfulQueries = [];
const queryResult = { command: "SELECT", rowCount: 0, oid: 0, rows: [], fields: [] };
const successfulConnection = { query: async (query, values) => { successfulQueries.push([query, values]); return queryResult; } };
const statement = new DatabaseStatement("select $1", "value");
await statement.execute(successfulConnection);
assert.deepEqual(successfulQueries.at(-1), ["select $1", ["value"]]);
const transaction = new DatabaseTransaction();
transaction.pushStatement(statement);
await transaction.execute(successfulConnection);
assert.deepEqual(successfulQueries.slice(-4).map(([query]) => query), ["BEGIN TRANSACTION", "SELECT 1 WHERE false", "select $1", "COMMIT"]);

const failedQueries = [];
const failedConnection = {
  query: async (query) => {
    failedQueries.push(query);
    if (query === "broken") throw new Error("expected failure");
    return queryResult;
  },
};
const failedTransaction = new DatabaseTransaction();
failedTransaction.pushStatement(new DatabaseStatement("broken"));
await assert.rejects(() => failedTransaction.execute(failedConnection), /expected failure/);
assert.equal(failedQueries.at(-1), "ROLLBACK");

const cache = new Cache();
cache.setThreads(0);
cache.setWriteImmediately2(false);
cache.setMaximum(1);
const flushed = [];
const makeValue = (key) => ({
  key,
  dirty: true,
  flush() { flushed.push(key); this.dirty = false; },
  clearDirty() { this.dirty = false; },
  getSize() { return 8; },
});
const firstEntry = new CacheEntry(makeValue, cache);
const secondEntry = new CacheEntry(makeValue, cache);
assert.equal(firstEntry.getValue("first").key, "first");
firstEntry.markDirty();
assert.equal(secondEntry.getValue("second").key, "second");
await cache.workerthread();
cache.checkIntegrity();
assert.deepEqual(cache.getStatus(), [1, 8]);
assert.deepEqual(flushed, ["first"]);

await FreppleInitialize(false);
assert.equal(FreppleVersion(), "9.18.0");
const plan = Plan.instance();
plan.setName("semantic-port");
plan.setCurrent("2026-08-19T00:00:00");
plan.setAutoFence("P2D");
plan.setCompletedAllowFuture(true);
assert.equal(plan.getName(), "semantic-port");
assert.equal(plan.getCurrent().toString(), "2026-08-19T00:00:00");
assert.equal(plan.getAutoFence().seconds, 172_800);
assert.equal(plan.getCompletedAllowFuture(), true);
FreppleReadXMLData("<plan><name>xml-plan</name><completed_allow_future>false</completed_allow_future></plan>");
assert.equal(plan.getName(), "xml-plan");
assert.equal(plan.getCompletedAllowFuture(), false);
new JSONInputString('{"plan":{"description":"json-plan","move_approved_early":"3"}}').parse(plan);
assert.equal(plan.getDescription(), "json-plan");
assert.equal(plan.getMoveApprovedEarly(), 3);

Customer.clear();
new Customer("first-customer");
assert.equal(plan.getCustomers().length, 1);
plan.erase("customer");
assert.equal(plan.getCustomers().length, 0);
assert.throws(() => plan.erase("unknown"), /erase operation not supported/);
assert.equal(plan.solve({ solve(targetPlan, payload) { return [targetPlan.getName(), payload]; } }, 7)[1], 7);

Customer.clear();
const hierarchyRoot = new CustomerDefault("root");
const hierarchyChild = new CustomerDefault("child");
const hierarchySibling = new CustomerDefault("sibling");
const hierarchyGrandchild = new CustomerDefault("grandchild");
assert.equal(Customer.all().length, 4);
assert.equal(Customer.find("child"), hierarchyChild);
assert.throws(() => new CustomerDefault("child"), /already exists/);
hierarchyChild.setOwner(hierarchyRoot);
hierarchySibling.setOwner(hierarchyRoot);
hierarchyGrandchild.setOwner(hierarchyChild);
assert.deepEqual([...hierarchyRoot.getAllMembers()].map((entry) => entry.getName()), ["child", "grandchild", "sibling"]);
assert.equal(hierarchyGrandchild.getHierarchyLevel(), 2);
assert.equal(hierarchyGrandchild.getTop(), hierarchyRoot);
assert.equal(hierarchyGrandchild.isMemberOf(hierarchyRoot), true);
hierarchyRoot.setOwner(hierarchyGrandchild);
assert.equal(hierarchyRoot.getOwner(), null);
hierarchyChild.dispose();
assert.deepEqual([...hierarchyRoot.getMembers()].map((entry) => entry.getName()), ["grandchild", "sibling"]);
assert.equal(hierarchyGrandchild.getOwner(), hierarchyRoot);
hierarchySibling.setName("aaa");
hierarchyRoot.sortMembers();
assert.deepEqual([...hierarchyRoot.getMembers()].map((entry) => entry.getName()), ["aaa", "grandchild"]);

const demandCustomer = new Demand();
demandCustomer.setCustomer(hierarchyRoot);
assert.equal(hierarchyRoot.getNumberOfDemands(), 1);
demandCustomer.setCustomer(hierarchySibling);
assert.equal(hierarchyRoot.getNumberOfDemands(), 0);
assert.equal(hierarchySibling.getNumberOfDemands(), 1);
hierarchySibling.dispose();
assert.equal(demandCustomer.getCustomer(), null);

Location.clear();
const location = new LocationDefault("location");
const locationDemand = new Demand();
const locationBuffer = new Buffer();
const locationResource = new Resource();
const locationOperation = new Operation();
const locationItemSupplier = new ItemSupplier();
const locationDistribution = new ItemDistribution();
locationDemand.setLocation(location);
locationBuffer.setLocation(location);
locationResource.setLocation(location);
locationOperation.setLocation(location);
locationItemSupplier.setLocation(location);
locationDistribution.setOrigin(location);
assert.deepEqual(location.getDistributions(), [locationDistribution]);
location.dispose();
assert.equal(locationDemand.getLocation(), null);
assert.equal(Buffer.all().includes(locationBuffer), false);
assert.equal(Resource.all().includes(locationResource), false);
assert.equal(Operation.all().includes(locationOperation), false);
assert.equal(ItemSupplier.all().includes(locationItemSupplier), false);
assert.equal(ItemDistribution.all().includes(locationDistribution), false);

Supplier.clear();
const supplier = new SupplierDefault("supplier");
const supplierLink = new ItemSupplier();
supplierLink.setSupplier(supplier);
assert.deepEqual(supplier.getItems(), [supplierLink]);
supplier.dispose();
assert.equal(ItemSupplier.all().includes(supplierLink), false);

Skill.clear();
const skill = new SkillDefault("skill");
const resourceSkill = new ResourceSkill();
const skillLoad = new Load();
resourceSkill.setSkill(skill);
skillLoad.setSkill(skill);
assert.deepEqual([...skill.getResources()], [resourceSkill]);
skill.dispose();
assert.equal(ResourceSkill.all().includes(resourceSkill), false);
assert.equal(skillLoad.getSkill(), null);

const associationSkill = new SkillDefault("association-skill");
const associationResource = new Resource();
associationResource.setName("association-resource");
const effectiveSkill = new DateRange(new PlanningDate("2026-09-01T00:00:00"), new PlanningDate("2026-10-01T00:00:00"));
const semanticResourceSkill = new ResourceSkill(associationSkill, associationResource, 4, effectiveSkill);
semanticResourceSkill.setName("primary");
semanticResourceSkill.setSource("semantic-test");
assert.equal(semanticResourceSkill.getResource(), associationResource);
assert.equal(semanticResourceSkill.getSkill(), associationSkill);
assert.deepEqual(associationResource.referencedBy("Resource"), [semanticResourceSkill]);
assert.deepEqual([...associationSkill.getResources()], [semanticResourceSkill]);
assert.equal(ResourceSkill.finder({ resource: associationResource, skill: associationSkill, priority: 4, name: "primary", effective_start: "2026-09-01T00:00:00" }), semanticResourceSkill);
assert.equal(ResourceSkill.finder({ resource: associationResource, skill: associationSkill, priority: 5 }), null);
assert.throws(() => semanticResourceSkill.setSkill(new SkillDefault("other-association-skill")), /Can't reassign/);
semanticResourceSkill.dispose();
assert.deepEqual(associationResource.referencedBy("Resource"), []);
assert.deepEqual([...associationSkill.getResources()], []);

Item.clear();
const item = new ItemMTS("item");
const mtoItem = new ItemMTO("mto-item");
assert.equal(Item.all().includes(mtoItem), true);
item.setCost(-4);
item.setWeight(3);
item.setWeight(-1);
item.setVolume(5);
item.setVolume(-1);
item.setUOM("kg");
assert.deepEqual([item.getCost(), item.getWeight(), item.getVolume(), item.getUOMString()], [0, 3, 5, "kg"]);
const itemBuffer = new Buffer();
const itemDemand = new Demand();
const itemOperation = new Operation();
const itemSupplier = new ItemSupplier();
const itemSupplierOwner = new SupplierDefault("item-supplier-owner");
const itemDistribution = new ItemDistribution();
itemBuffer.setItem(item);
itemBuffer.setCluster(12);
itemDemand.setItem(item);
itemOperation.setItem(item);
itemSupplier.setSupplier(itemSupplierOwner);
itemSupplier.setItem(item);
itemDistribution.setItem(item);
HasLevel.getNumberOfClusters();
itemBuffer.setCluster(12);
assert.equal(item.getBufferIterator().next(), itemBuffer);
assert.equal(item.getDemandIterator().next(), itemDemand);
assert.equal(item.getOperationIterator().next(), itemOperation);
assert.deepEqual(item.getSuppliers(), [itemSupplier]);
assert.deepEqual(item.getDistributions(), [itemDistribution]);
assert.equal(item.getCluster(), 12);

const purchaseOperation = new OperationItemSupplier();
const purchasePlan = new OperationPlan();
const purchaseFlowPlan = new HeaderModelAdapter();
purchasePlan.setOperation(purchaseOperation);
purchasePlan.setProposed(true);
purchaseFlowPlan.setDate(new PlanningDate("2026-08-10T00:00:00"));
purchaseFlowPlan.setOperationPlan(purchasePlan);
itemBuffer.setBatch("batch-a");
itemBuffer.setFlowPlans([purchaseFlowPlan]);
assert.equal(item.findEarliestPurchaseOrder("batch-a").toString(), "2026-08-10T00:00:00");
assert.equal(item.findEarliestPurchaseOrder("other").equals(PlanningDate.infiniteFuture), true);

const procurementSupplier = new SupplierDefault("procurement-supplier");
const procurementLocation = new LocationDefault("procurement-supplier");
const procurementResource = new Resource();
const procurementBuffer = new Buffer();
procurementBuffer.setName("procurement-buffer");
procurementBuffer.setItem(item);
procurementBuffer.setLocation(procurementLocation);
const procurement = new ItemSupplier(procurementSupplier, item, 2, new DateRange(new PlanningDate("2026-09-01T00:00:00"), new PlanningDate("2027-01-01T00:00:00")));
procurement.setName("contract-a");
procurement.setLocation(procurementLocation);
procurement.setResource(procurementResource);
procurement.setLeadTime("P2D");
procurement.setFence("P1D");
procurement.setBatchWindow("PT4H");
procurement.setHardSafetyLeadTime("PT2H");
procurement.setExtraSafetyLeadTime("PT3H");
procurement.setSizeMinimum(5);
procurement.setSizeMultiple(2);
procurement.setSizeMaximum(50);
procurement.setCost(7.5);
procurement.setResourceQuantity(0.25);
procurement.setSource("contract-import");
procurement.setHidden(true);
procurement.setLeadTime(-1);
procurement.setSizeMinimum(-1);
procurement.setSizeMultiple(-1);
procurement.setSizeMaximum(4);
procurement.setResourceQuantity(-1);
assert.deepEqual([procurement.getLeadTime().seconds, procurement.getSizeMinimum(), procurement.getSizeMultiple(), procurement.getSizeMaximum(), procurement.getResourceQuantity()], [172800, 5, 2, 50, 0.25]);
assert.equal(ItemSupplier.finder({ item, supplier: procurementSupplier, priority: 2, effective_start: "2026-09-01T00:00:00" }), procurement);
const generatedPurchase = OperationItemSupplier.findOrCreate(procurement, procurementBuffer);
assert.equal(OperationItemSupplier.findOrCreate(procurement, procurementBuffer), generatedPurchase);
assert.equal(generatedPurchase.getName(), "Purchase procurement-buffer from procurement-supplier valid from 2026-09-01T00:00:00");
assert.deepEqual([generatedPurchase.getOrderType(), generatedPurchase.getDuration().seconds, generatedPurchase.getSizeMinimum(), generatedPurchase.getSizeMultiple(), generatedPurchase.getSizeMaximum(), generatedPurchase.getCost(), generatedPurchase.getFence().seconds, generatedPurchase.getPostTime().seconds, generatedPurchase.getHardSafetyOffset().seconds, generatedPurchase.getHidden()], ["PO", 172800, 5, 2, 50, 7.5, 86400, 10800, 7200, true]);
assert.equal([...procurement.getOperations()][0], generatedPurchase);

const distributionOrigin = new LocationDefault("distribution-origin");
const distributionDestination = new LocationDefault("distribution-destination");
const sourceBuffer = new Buffer();
sourceBuffer.setName("source-buffer");
sourceBuffer.setItem(item);
sourceBuffer.setLocation(distributionOrigin);
sourceBuffer.setBatch("lot-7");
const destinationBuffer = new Buffer();
destinationBuffer.setName("destination-buffer");
destinationBuffer.setItem(item);
destinationBuffer.setLocation(distributionDestination);
const distribution = new ItemDistribution(item, distributionOrigin, distributionDestination, 3, new DateRange(new PlanningDate("2026-09-02T00:00:00"), new PlanningDate("2027-01-01T00:00:00")));
distribution.setName("lane-a");
distribution.setLeadTime("P1D");
distribution.setFence("PT6H");
distribution.setBatchWindow("PT8H");
distribution.setSizeMinimum(4);
distribution.setSizeMultiple(2);
distribution.setSizeMaximum(40);
distribution.setCost(3);
distribution.setResource(procurementResource);
distribution.setResourceQuantity(0.5);
distribution.setSource("lane-import");
assert.throws(() => distribution.setDestination(distributionOrigin), /different|reassign/);
assert.equal(ItemDistribution.finder({ item, origin: distributionOrigin, destination: distributionDestination, priority: 3, effective_start: "2026-09-02T00:00:00" }), distribution);
const generatedDistribution = OperationItemDistribution.findOrCreate(distribution, sourceBuffer, destinationBuffer);
assert.equal(OperationItemDistribution.findOrCreate(distribution, sourceBuffer, destinationBuffer), generatedDistribution);
assert.equal(generatedDistribution.getName(), "Ship item @ lot-7 from distribution-origin to distribution-destination valid from 2026-09-02T00:00:00");
assert.deepEqual([generatedDistribution.getOrderType(), generatedDistribution.getDuration().seconds, generatedDistribution.getSizeMinimum(), generatedDistribution.getSizeMultiple(), generatedDistribution.getSizeMaximum(), generatedDistribution.getCost(), generatedDistribution.getFence().seconds, generatedDistribution.getBatchWindow().seconds, generatedDistribution.getHidden()], ["DO", 86400, 4, 2, 40, 3, 21600, 28800, true]);
assert.equal(distribution.getOperations().next(), generatedDistribution);
assert.throws(() => OperationItemDistribution.findOrCreate(distribution, sourceBuffer, sourceBuffer), /different/);
generatedDistribution.dispose();
assert.equal(distribution.getOperations().next(), null);
procurement.dispose();
assert.equal(Operation.all().includes(generatedPurchase), false);
assert.deepEqual(procurementSupplier.getItems(), []);
distributionDestination.dispose();
assert.equal(ItemDistribution.all().includes(distribution), false);

item.dispose();
assert.equal(itemBuffer.getItem(), undefined);
assert.equal(itemDemand.getItem(), null);
assert.equal(Operation.all().includes(itemOperation), false);
assert.equal(ItemSupplier.all().includes(itemSupplier), false);
assert.equal(ItemDistribution.all().includes(itemDistribution), false);

Demand.clear();
Location.clear();
Item.clear();
Operation.clear();
const demandLocation = new LocationDefault("demand-location");
const demandItem = new ItemMTS("demand-item");
const demand = new DemandDefault("sales-order-1");
demand.setItem(demandItem);
demand.setLocation(demandLocation);
demand.setQuantity(20);
demand.setQuantity(-1);
demand.setQuantity(20 + 0.0000001);
demand.setPriority(3);
demand.setDue("2026-09-10T00:00:00");
demand.setMaxLateness("P2D");
assert.deepEqual([demand.getQuantity(), demand.getPriority(), demand.getMinShipment(), demand.getMaxLateness().seconds], [20, 3, 2, 172800]);
demand.setMinShipment(5);
demand.setMinShipment(-2);
assert.deepEqual([demand.getMinShipment(), demand.getRawMinShipment(), demand.isMinShipmentDefault()], [5, 5, false]);
demand.setStatusString("quote");
assert.deepEqual([demand.getStatus(), demand.getStatusString()], [Demand.STATUS_QUOTE, "quote"]);
demand.setStatus(Demand.STATUS_OPEN);
assert.equal(demand.getStatusString(), "open");
const deliveryOperation = demand.getDeliveryOperation();
assert.equal(deliveryOperation.getOrderType(), "DLVR");
assert.equal(deliveryOperation.getName(), "Ship demand-item @ demand-location");
assert.equal(deliveryOperation.getBuffer().getItem(), demandItem);
assert.equal(demand.getDeliveryOperation(), deliveryOperation);

const lateDelivery = new OperationPlan();
lateDelivery.setOperation(deliveryOperation);
lateDelivery.setEnd(new PlanningDate("2026-09-12T00:00:00"));
lateDelivery.setQuantity(8);
lateDelivery.setProposed(true);
const earlyLockedDelivery = new OperationPlan();
earlyLockedDelivery.setOperation(deliveryOperation);
earlyLockedDelivery.setEnd(new PlanningDate("2026-09-09T00:00:00"));
earlyLockedDelivery.setQuantity(4);
earlyLockedDelivery.setProposed(false);
demand.addDelivery(earlyLockedDelivery);
demand.addDelivery(lateDelivery);
demand.addDelivery(lateDelivery);
assert.deepEqual([...demand.getDelivery()], [lateDelivery, earlyLockedDelivery]);
assert.equal(demand.getOperationPlans().next(), lateDelivery);
assert.equal(demand.getLatestDelivery(), lateDelivery);
assert.equal(demand.getEarliestDelivery(), earlyLockedDelivery);
assert.equal(demand.getPlannedQuantity(), 12);
assert.equal(demand.getDeliveryDate().toString(), "2026-09-12T00:00:00");
assert.equal(demand.getDelay().seconds, 172800);
demand.deleteOperationPlans(false);
assert.deepEqual([...demand.getDelivery()], [earlyLockedDelivery]);
demand.setStatusString("closed");
assert.deepEqual([...demand.getDelivery()], [earlyLockedDelivery]);
demand.deleteOperationPlans(true);
assert.deepEqual([...demand.getDelivery()], []);

const demandConstraint = demand.addConstraint("problem_material_shortage", "demand-item @ demand-location");
assert.equal(demand.getConstraintIterator().next().value, demandConstraint);
assert.equal(demand.solve({ solve(targetDemand, payload) { return [targetDemand.getName(), payload]; } }, 9)[1], 9);

const demandGroup = new DemandGroup("demand-group");
const groupFirst = new DemandDefault("group-first");
const groupSecond = new DemandDefault("group-second");
groupFirst.setOwner(demandGroup);
groupSecond.setOwner(demandGroup);
groupFirst.setPriority(7);
groupSecond.setPriority(2);
groupFirst.setDue("2026-10-03T00:00:00");
groupSecond.setDue("2026-10-01T00:00:00");
assert.deepEqual([demandGroup.getQuantity(), demandGroup.getPriority(), demandGroup.getDue().toString()], [0, 2, "2026-10-01T00:00:00"]);
demandGroup.setPriority(4);
demandGroup.setDue("2026-10-05T00:00:00");
demandGroup.setPolicyString("inratio");
assert.deepEqual([groupFirst.getPriority(), groupSecond.getPriority(), groupFirst.getDue().toString(), demandGroup.getPolicy(), demandGroup.getPolicyString()], [4, 4, "2026-10-05T00:00:00", Demand.POLICY_INRATIO, "inratio"]);

Calendar.clear();
const calendar = new CalendarDefault("working-hours");
calendar.setDefault(5);
const broadBucket = calendar.addBucket("2026-08-16T00:00:00", "2026-08-23T00:00:00", 3);
broadBucket.setPriority(10);
const mondayBucket = calendar.addBucket("2026-08-16T00:00:00", "2026-08-23T00:00:00", 10);
mondayBucket.setPriority(0);
mondayBucket.setDays(2);
mondayBucket.setStartTime(8 * 3600);
mondayBucket.setEndTime(17 * 3600);
assert.deepEqual([...calendar.getBuckets()].map((bucket) => bucket.getPriority()), [0, 10]);
assert.equal(calendar.getValue("2026-08-17T09:00:00"), 10);
assert.equal(calendar.getValue("2026-08-17T18:00:00"), 3);
assert.equal(calendar.getValue("2026-08-18T09:00:00"), 3);
const calendarEvents = calendar.getEvents("2026-08-17T09:00:00");
assert.deepEqual(calendarEvents.next().value?.map((value) => value instanceof PlanningDate ? value.toString() : value), ["2026-08-17T09:00:00", 10]);
assert.deepEqual(calendarEvents.next().value?.map((value) => value instanceof PlanningDate ? value.toString() : value), ["2026-08-17T17:00:00", 3]);
const alternateCalendar = new CalendarDefault("alternate-hours");
mondayBucket.setCalendar(alternateCalendar);
assert.equal([...calendar.getBuckets()].includes(mondayBucket), false);
assert.equal([...alternateCalendar.getBuckets()].includes(mondayBucket), true);
assert.throws(() => calendar.removeBucket(mondayBucket), /unavailable bucket/);
calendar.setValue("2026-08-20T00:00:00", "2026-08-21T00:00:00", 12);
assert.equal(calendar.getValue("2026-08-20T12:00:00"), 12);
const namedBucket = new CalendarBucket();
namedBucket.setName("named-bucket");
assert.equal(CalendarBucket.getByName("named-bucket"), namedBucket);
namedBucket.dispose();
assert.equal(CalendarBucket.getByName("named-bucket"), undefined);
const calendarLocation = new LocationDefault("calendar-location");
const calendarBuffer = new Buffer();
const calendarResource = new Resource();
const calendarOperation = new Operation();
calendarLocation.setAvailable(calendar);
calendarBuffer.setMinimumCalendar(calendar);
calendarResource.setEfficiencyCalendar(calendar);
calendarOperation.setSizeMinimumCalendar(calendar);
calendar.dispose();
assert.equal(calendarLocation.getAvailable(), null);
assert.equal(calendarBuffer.getMinimumCalendar(), undefined);
assert.equal(calendarResource.getEfficiencyCalendar(), undefined);
assert.equal(calendarOperation.getSizeMinimumCalendar(), undefined);

SetupMatrix.clear();
const matrix = new SetupMatrixDefault("changeovers");
const catchAllRule = new SetupMatrixRuleDefault(matrix, ".*", "B", new Duration(20), 8, 20);
const exactRule = new SetupMatrixRuleDefault(matrix, "A", "B", new Duration(10), 4, 10);
assert.deepEqual([...matrix.getRules()].map((rule) => rule.getPriority()), [10, 20]);
assert.equal(matrix.calculateSetup("A", "A"), null);
assert.equal(matrix.calculateSetup("A", "B"), exactRule);
exactRule.setFromSetup("C");
assert.equal(matrix.calculateSetup("A", "B"), catchAllRule);
const duplicateRule = new SetupMatrixRuleDefault(null, "", "", 0, 0, 10);
assert.throws(() => duplicateRule.setSetupMatrix(matrix), /Duplicate rules with priority 10/);
const invalidRule = new SetupMatrixRuleDefault(null, "", "", 0, 0, 30);
invalidRule.setSetupMatrix(matrix);
assert.throws(() => invalidRule.setFromSetup("["), /Invalid setup matrix rule/);
invalidRule.dispose();
const disallowed = matrix.calculateSetup("missing", "conversion");
assert.equal(disallowed.getDuration().seconds, 7 * 86_400);
assert.equal(disallowed.getCost(), Number.MAX_VALUE);
const matrixResource = new Resource();
matrixResource.setSetupMatrix(matrix);
matrix.dispose();
assert.equal(matrixResource.getSetupMatrix(), undefined);

Resource.clear();
const toolPool = new ResourceDefault("tool-pool");
const toolChild = new ResourceDefault("tool-child");
const toolGrandchild = new ResourceDefault("tool-grandchild");
toolChild.setOwner(toolPool);
toolGrandchild.setOwner(toolChild);
toolGrandchild.setTool(true);
toolChild.setToolPerPiece(true);
assert.deepEqual([toolPool.getTool(), toolChild.getTool(), toolGrandchild.getTool()], [true, true, true]);
assert.deepEqual([toolPool.getToolPerPiece(), toolChild.getToolPerPiece(), toolGrandchild.getToolPerPiece()], [true, true, true]);
const bucketPool = new ResourceBuckets("bucket-pool");
const bucketChild = new ResourceBuckets("bucket-child");
bucketChild.setOwner(bucketPool);
assert.throws(() => new ResourceDefault("mixed-child").setOwner(bucketPool), /can't mix bucketized/i);
assert.throws(() => bucketPool.setSetupMatrix(new SetupMatrixDefault("bucket-matrix")), /No setup matrix/);

const availabilityLocation = new LocationDefault("availability-location");
const resourceAvailability = new CalendarDefault("resource-availability");
resourceAvailability.setDefault(0);
resourceAvailability.setValue("2026-08-20T08:00:00", "2026-08-20T16:00:00", 1);
const locationAvailability = new CalendarDefault("location-availability");
locationAvailability.setDefault(0);
locationAvailability.setValue("2026-08-20T12:00:00", "2026-08-20T20:00:00", 1);
availabilityLocation.setAvailable(locationAvailability);
const calendarResourceModel = new ResourceDefault("calendar-resource");
calendarResourceModel.setLocation(availabilityLocation);
calendarResourceModel.setAvailable(resourceAvailability);
assert.equal(calendarResourceModel.getAvailable("2026-08-20T00:00:00", "2026-08-21T00:00:00").seconds, 14_400);

const capacityCalendar = new CalendarDefault("capacity-calendar");
capacityCalendar.setDefault(2);
calendarResourceModel.setMaximumCalendar(capacityCalendar);
assert.equal(calendarResourceModel.getMaximumCalendar(), capacityCalendar);
capacityCalendar.dispose();
assert.equal(calendarResourceModel.getMaximumCalendar(), undefined);

const datedSkill = new SkillDefault("dated-skill");
const datedResourceSkill = new ResourceSkill(datedSkill, calendarResourceModel, 3,
  new DateRange(new PlanningDate("2026-08-01T00:00:00"), new PlanningDate("2026-09-01T00:00:00")));
const skillOutput = {};
assert.equal(calendarResourceModel.hasSkill(datedSkill, "2026-08-10T00:00:00", "2026-08-20T00:00:00", skillOutput), true);
assert.equal(skillOutput.value, datedResourceSkill);
assert.equal(calendarResourceModel.hasSkill(datedSkill, "2026-07-31T00:00:00", "2026-08-20T00:00:00"), false);

const infiniteResource = new ResourceInfinite("infinite-resource");
assert.equal(infiniteResource.getConstrained(), false);
infiniteResource.setConstrained(true);
assert.equal(infiniteResource.getConstrained(), false);
assert.equal(infiniteResource.getUtilization("2026-08-20T00:00:00", "2026-08-21T00:00:00"), 0);

const bucketCapacityCalendar = new CalendarDefault("bucket-capacity");
bucketCapacityCalendar.setDefault(0);
bucketCapacityCalendar.setValue("2026-08-20T00:00:00", "2026-08-21T00:00:00", 8);
bucketPool.setMaximumCalendar(bucketCapacityCalendar);
bucketChild.setMaximumCalendar(bucketCapacityCalendar);
assert.equal(bucketPool.getMaxBucketCapacity(), 8);
const bucketRows = [...bucketPool.plan([
  new PlanningDate("2026-08-20T00:00:00"),
  new PlanningDate("2026-08-21T00:00:00"),
])];
assert.equal(bucketRows.length, 1);
assert.equal(bucketRows[0].available, 8);

const loadOperation = new Operation("load-operation");
const loadResource = new ResourceDefault("load-resource");
const alternateResource = new ResourceDefault("load-alternate-resource");
const leadingLoad = new LoadDefault(loadOperation, loadResource, 2,
  new DateRange(new PlanningDate("2026-08-01T00:00:00"), new PlanningDate("2026-09-01T00:00:00")));
leadingLoad.setName("load-group");
leadingLoad.setSetupString("setup-a");
const alternateLoad = new LoadDefault(loadOperation, alternateResource, 1);
alternateLoad.setSetupString("setup-b");
assert.equal(alternateLoad.getSetupString(), "");
alternateLoad.setName("load-group");
alternateLoad.setSetupString("setup-b");
assert.equal(alternateLoad.getSetup(), "setup-b");
assert.equal(loadOperation.getLoads().includes(leadingLoad), true);
assert.equal(loadResource.getLoads().includes(leadingLoad), true);
assert.equal(Load.finder({ operation: loadOperation, resource: loadResource, name: "load-group", priority: 1 }), leadingLoad);
assert.equal(alternateLoad.getAlternate(), leadingLoad);
assert.equal(leadingLoad.getAlternate(), null);
assert.equal(leadingLoad.hasAlternates(), true);
leadingLoad.setQuantity(-1);
leadingLoad.setQuantityFixed(-1);
assert.deepEqual([leadingLoad.getQuantity(), leadingLoad.getQuantityFixed()], [2, 0]);
assert.equal(leadingLoad.getSearch(), "MINPENALTY");
leadingLoad.setSearch("min-cost-penalty");
assert.equal(leadingLoad.getSearch(), "MINCOSTPENALTY");
assert.throws(() => leadingLoad.setSearch("unknown"), /Invalid search mode/);
leadingLoad.setHidden(true);
assert.deepEqual([leadingLoad.getHidden(), leadingLoad.getHiddenLoad()], [true, true]);
leadingLoad.setHidden(false);
loadResource.setHidden(true);
assert.deepEqual([leadingLoad.getHidden(), leadingLoad.getHiddenLoad()], [true, false]);
loadResource.setHidden(false);

const loadSkill = new SkillDefault("load-skill");
leadingLoad.setSkill(loadSkill);
loadSkill.dispose();
assert.equal(leadingLoad.getSkill(), null);
assert.equal(loadOperation.getLoads().includes(leadingLoad), true);

const invalidBucketLoad = new LoadBucketizedPercentage(loadOperation, loadResource, 1);
assert.equal(invalidBucketLoad.getResource(), null);
const percentLoad = new LoadBucketizedPercentage(loadOperation, bucketChild, 1);
const fromStartLoad = new LoadBucketizedFromStart(loadOperation, bucketChild, 1);
const fromEndLoad = new LoadBucketizedFromEnd(loadOperation, bucketChild, 1);
percentLoad.setOffset(25);
fromStartLoad.setOffset("P1D");
fromEndLoad.setOffset("P1D");
percentLoad.setOffset(101);
fromStartLoad.setOffset(-1);
assert.equal(percentLoad.getOffset(), 25);
assert.equal(fromStartLoad.getOffset().seconds, 86_400);
const loadPlanStart = new OperationPlan();
loadPlanStart.setOperation(loadOperation);
loadPlanStart.setDates(new DateRange(new PlanningDate("2026-08-20T00:00:00"), new PlanningDate("2026-08-24T00:00:00")));
loadPlanStart.setStart("2026-08-20T00:00:00");
loadPlanStart.setEnd("2026-08-24T00:00:00");
loadPlanStart.setQuantity(10);
loadPlanStart.setProposed(true);
const bucketLoadPlan = new HeaderModelAdapter();
bucketLoadPlan.setOperationPlan(loadPlanStart);
bucketLoadPlan.setOperation(loadOperation);
bucketLoadPlan.setResource(bucketChild);
bucketLoadPlan.setDate("2026-08-21T00:00:00");
bucketLoadPlan.setLoad(percentLoad);
bucketLoadPlan.setStart(true);
assert.equal(percentLoad.getLoadplanDate(bucketLoadPlan).toString(), "2026-08-21T00:00:00");
assert.equal(fromStartLoad.getLoadplanDate(bucketLoadPlan).toString(), "2026-08-21T00:00:00");
assert.equal(fromEndLoad.getLoadplanDate(bucketLoadPlan).toString(), "2026-08-23T00:00:00");

const quantityLoadPlan = new HeaderModelAdapter();
quantityLoadPlan.setOperationPlan(loadPlanStart);
quantityLoadPlan.setOperation(loadOperation);
quantityLoadPlan.setResource(loadResource);
quantityLoadPlan.setLoad(leadingLoad);
quantityLoadPlan.setStart(true);
quantityLoadPlan.setDate("2026-08-20T00:00:00");
assert.equal(leadingLoad.getLoadplanQuantity(quantityLoadPlan), 2);
quantityLoadPlan.setStart(false);
assert.equal(leadingLoad.getLoadplanQuantity(quantityLoadPlan), -2);
loadResource.setToolPerPiece(true);
quantityLoadPlan.setStart(true);
assert.equal(leadingLoad.getLoadplanQuantity(quantityLoadPlan), 20);
loadResource.setToolPerPiece(false);
bucketChild.setEfficiency(50);
bucketLoadPlan.setLoad(percentLoad);
bucketLoadPlan.setStart(true);
assert.equal(percentLoad.getLoadplanQuantity(bucketLoadPlan), -20);
loadPlanStart.setCompleted(true);
assert.equal(percentLoad.getLoadplanQuantity(bucketLoadPlan), 0);
loadPlanStart.setCompleted(false);
loadPlanStart.setConfirmed(true);
loadPlanStart.setConsumeCapacity(false);
assert.equal(percentLoad.getLoadplanQuantity(bucketLoadPlan), 0);

const preferredPool = new ResourceDefault("preferred-pool");
const lessEfficient = new ResourceDefault("less-efficient");
const moreEfficient = new ResourceDefault("more-efficient");
lessEfficient.setOwner(preferredPool);
moreEfficient.setOwner(preferredPool);
lessEfficient.setEfficiency(80);
moreEfficient.setEfficiency(120);
const preferredSkill = new SkillDefault("preferred-skill");
new ResourceSkill(preferredSkill, lessEfficient, 2);
new ResourceSkill(preferredSkill, moreEfficient, 1);
const poolLoad = new LoadDefault(loadOperation, preferredPool, 1);
poolLoad.setSkill(preferredSkill);
const preferredPlan = new OperationPlan();
preferredPlan.setStart("2026-08-20T00:00:00");
preferredPlan.setEnd("2026-08-21T00:00:00");
preferredPlan.setLoadPlans([]);
assert.equal(poolLoad.findPreferredResource("2026-08-20T12:00:00", preferredPlan), moreEfficient);

OperationPlan.clear();
const plannedOperation = new Operation("operationplan-operation");
const deliveryDemand = new DemandDefault("operationplan-demand");
deliveryDemand.setPriority(6);
deliveryDemand.setDue("2026-08-25T00:00:00");
const parentPlan = new OperationPlan(plannedOperation);
parentPlan.setReference("semantic-opplan");
parentPlan.setStartEndAndQuantity("2026-08-20T00:00:00", "2026-08-24T00:00:00", 12);
parentPlan.setQuantityCompleted(3);
parentPlan.setDemand(deliveryDemand);
assert.equal(OperationPlan.findReference("semantic-opplan"), parentPlan);
assert.equal([...plannedOperation.getOperationPlans()].includes(parentPlan), true);
assert.equal(deliveryDemand.getDelivery().includes(parentPlan), true);
assert.deepEqual([
  parentPlan.getQuantity(), parentPlan.getQuantityCompletedRaw(), parentPlan.getQuantityRemaining(),
  parentPlan.getPriority(), parentPlan.getDelay().seconds,
], [12, 3, 12, 6, -86_400]);

parentPlan.setApproved(true);
assert.deepEqual([parentPlan.getApproved(), parentPlan.getQuantityCompleted(), parentPlan.getQuantityRemaining()], [true, 3, 9]);
const childPlan = new OperationPlan(plannedOperation);
childPlan.setStartEndAndQuantity("2026-08-21T00:00:00", "2026-08-23T00:00:00", 4);
childPlan.setOwner(parentPlan);
parentPlan.setConfirmed(true);
assert.equal(childPlan.getConfirmed(), true);
assert.equal(childPlan.getTopOwner(), parentPlan);
assert.deepEqual([...parentPlan.getSubOperationPlans()], [childPlan]);
assert.throws(() => parentPlan.setOwner(childPlan), /Cyclic operationplan ownership/);

const attachedFlowPlan = new HeaderModelAdapter();
const attachedLoadPlan = new HeaderModelAdapter();
parentPlan.attachFlowPlan(attachedFlowPlan);
parentPlan.attachLoadPlan(attachedLoadPlan);
assert.deepEqual([parentPlan.sizeFlowPlans(), parentPlan.sizeLoadPlans()], [1, 1]);
parentPlan.getFlowPlans().next();
parentPlan.getFlowPlans().deleteFlowPlan();
assert.equal(parentPlan.sizeFlowPlans(), 0);
parentPlan.getLoadPlans().next();
parentPlan.getLoadPlans().deleteLoadPlan();
assert.equal(parentPlan.sizeLoadPlans(), 0);

parentPlan.deactivate();
assert.equal(OperationPlan.findReference("semantic-opplan"), null);
assert.equal(deliveryDemand.getDelivery().includes(parentPlan), false);
assert.equal([...plannedOperation.getOperationPlans()].includes(parentPlan), false);
parentPlan.activate(false);
assert.equal(OperationPlan.findReference("semantic-opplan"), parentPlan);
parentPlan.dispose();
assert.equal(OperationPlan.findReference("semantic-opplan"), null);
assert.equal([...plannedOperation.getOperationPlans()].includes(parentPlan), false);
assert.equal(OperationPlan.all().includes(childPlan), false);
deliveryDemand.dispose();
plannedOperation.dispose();

const inventoryTimeline = new TimeLine();
const consumptionEvent = new TimeLineEventChangeOnhand(-4, "2026-08-20T00:00:00");
const productionEvent = new TimeLineEventChangeOnhand(10, "2026-08-20T00:00:00");
inventoryTimeline.insert(consumptionEvent);
inventoryTimeline.insert(productionEvent);
assert.deepEqual(inventoryTimeline.snapshot(), [productionEvent, consumptionEvent]);
assert.deepEqual([
  productionEvent.getOnhand(), consumptionEvent.getOnhand(),
  productionEvent.getCumulativeProduced(), consumptionEvent.getCumulativeConsumed(),
], [10, 6, 10, 4]);
assert.deepEqual([productionEvent.isFirstOnDate(), consumptionEvent.isLastOnDate()], [true, true]);

const inventoryReset = new TimeLineEventSetOnhand("2026-08-21T00:00:00", 3, inventoryTimeline);
const postResetConsumption = new TimeLineEventChangeOnhand(-2, "2026-08-22T00:00:00");
inventoryTimeline.insert(postResetConsumption);
assert.deepEqual([inventoryReset.getOnhand(), postResetConsumption.getOnhand()], [3, 1]);
const inventoryMinimum = new TimeLineEventMinQuantity("2026-08-21T00:00:00", inventoryTimeline, 2);
const inventoryMaximum = new TimeLineEventMaxQuantity("2026-08-22T00:00:00", inventoryTimeline, 20);
assert.deepEqual([
  inventoryTimeline.getMin(postResetConsumption), inventoryTimeline.getMin(inventoryMinimum, false),
  inventoryTimeline.getMax(postResetConsumption), inventoryTimeline.getExcess(postResetConsumption),
], [2, 0, 20, -19]);
postResetConsumption.setTimelineDate("2026-08-19T00:00:00");
inventoryTimeline.update(postResetConsumption, postResetConsumption.getDate());
assert.equal(inventoryTimeline.snapshot()[0], postResetConsumption);
inventoryTimeline.erase(postResetConsumption);
assert.equal(postResetConsumption.getTimeLine(), null);
assert.equal(inventoryTimeline.check(), true);

const materialOperation = new Operation("flowplan-operation");
const materialLocation = new LocationDefault("flowplan-location");
const materialItem = new ItemMTS("flowplan-item");
const materialBuffer = Buffer.findOrCreate(materialItem, materialLocation);
assert.ok(materialBuffer);
const productionFlow = new FlowEnd(materialOperation, materialBuffer, 2);
const consumptionFlow = new FlowStart(materialOperation, materialBuffer, -1);
const materialPlan = new OperationPlan(materialOperation);
materialPlan.setStartEndAndQuantity("2026-08-20T00:00:00", "2026-08-21T00:00:00", 5);
const productionPlan = new FlowPlan(materialPlan, productionFlow);
const consumptionPlan = new FlowPlan(materialPlan, consumptionFlow);
assert.deepEqual([productionPlan.getQuantity(), consumptionPlan.getQuantity()], [10, -5]);
assert.deepEqual([...materialPlan.getFlowPlans()], [productionPlan, consumptionPlan]);
assert.deepEqual(materialBuffer.getFlowPlans(), [consumptionPlan, productionPlan]);
assert.equal(productionPlan.getFeasible(), true);
materialPlan.setQuantity(7);
assert.deepEqual([productionPlan.getQuantity(), consumptionPlan.getQuantity()], [14, -7]);
materialPlan.setApproved(true);
productionPlan.setConfirmed(true);
productionPlan.setDate("2026-08-22T00:00:00");
assert.equal(productionPlan.getDate().toString(), "2026-08-22T00:00:00");
assert.equal(productionPlan.getStatus(), "confirmed");
assert.equal(productionPlan.getPeriodOfCover() instanceof Duration, true);
consumptionPlan.dispose();
assert.equal(materialPlan.sizeFlowPlans(), 1);
assert.deepEqual(materialBuffer.getFlowPlans(), [productionPlan]);
productionPlan.dispose();
assert.equal(materialPlan.sizeFlowPlans(), 0);
for (const value of [materialPlan, productionFlow, consumptionFlow, materialOperation, materialBuffer,
  materialItem, materialLocation]) value.dispose();

const peggingLocation = new LocationDefault("pegging-location");
const peggingItem = new ItemMTS("pegging-item");
const peggingBuffer = Buffer.findOrCreate(peggingItem, peggingLocation);
assert.ok(peggingBuffer);
const peggingProducer = new Operation("pegging-producer");
const peggingConsumer = new Operation("pegging-consumer");
const peggingProduceFlow = new FlowEnd(peggingProducer, peggingBuffer, 1);
const peggingConsumeFlow = new FlowStart(peggingConsumer, peggingBuffer, -1);
const peggingProducePlan = new OperationPlan(peggingProducer);
peggingProducePlan.setStartEndAndQuantity("2026-08-20T00:00:00", "2026-08-21T00:00:00", 10);
new FlowPlan(peggingProducePlan, peggingProduceFlow);
const peggingConsumePlan = new OperationPlan(peggingConsumer);
peggingConsumePlan.setStartEndAndQuantity("2026-08-22T00:00:00", "2026-08-23T00:00:00", 6);
new FlowPlan(peggingConsumePlan, peggingConsumeFlow);
const peggingDemand = new DemandDefault("pegging-demand");
peggingConsumePlan.setDemand(peggingDemand);
const downstreamPegging = [...peggingProducePlan.getPeggingDownstream()];
assert.equal(downstreamPegging.every((state) => state instanceof PeggingIteratorState), true);
assert.deepEqual(downstreamPegging.map((state) => [state.getOperationPlan(), state.getQuantity(), state.getLevel()]), [
  [peggingProducePlan, 10, 0], [peggingConsumePlan, 6, 1],
]);
const upstreamPegging = [...peggingConsumePlan.getPeggingUpstream()];
assert.equal(upstreamPegging.some((state) => state.getOperationPlan() === peggingProducePlan), true);
const demandPegging = new PeggingDemandIterator(peggingProducePlan);
assert.equal(demandPegging.next(), demandPegging);
assert.deepEqual([demandPegging.getDemand(), demandPegging.getQuantity()], [peggingDemand, 6]);
assert.equal(new PeggingIterator(peggingProducePlan, true, 0).getMaxLevel(), 0);
for (const value of [peggingProducePlan, peggingConsumePlan, peggingProduceFlow, peggingConsumeFlow,
  peggingProducer, peggingConsumer, peggingDemand, peggingBuffer, peggingItem, peggingLocation]) value.dispose();

const capacityOperation = new Operation("loadplan-operation");
const primaryCapacity = new ResourceDefault("loadplan-primary-resource");
const alternateCapacity = new ResourceDefault("loadplan-alternate-resource");
primaryCapacity.setMaximum(1);
alternateCapacity.setMaximum(3);
const capacityLoad = new LoadDefault(capacityOperation, primaryCapacity, 2);
const capacityPlan = new OperationPlan(capacityOperation);
capacityPlan.setStartEndAndQuantity("2026-08-20T08:00:00", "2026-08-20T16:00:00", 6);
const capacityStart = new LoadPlan(capacityPlan, capacityLoad);
const capacityEnd = capacityStart.getOtherLoadPlan();
assert.ok(capacityEnd);
assert.deepEqual([
  capacityStart.isStart(), capacityEnd.isStart(), capacityStart.getQuantity(), capacityEnd.getQuantity(),
], [true, false, 2, -2]);
assert.deepEqual([...capacityPlan.getLoadPlans()], [capacityStart, capacityEnd]);
assert.deepEqual([...new LoadPlanIterator(capacityPlan)], [capacityStart, capacityEnd]);
assert.equal(primaryCapacity.getLoadPlans().includes(capacityStart), true);
assert.equal(capacityStart.getFeasible(), false);
capacityStart.setResource(alternateCapacity, false);
assert.deepEqual([capacityStart.getResource(), capacityEnd.getResource()], [alternateCapacity, alternateCapacity]);
assert.equal(primaryCapacity.getLoadPlans().includes(capacityStart), false);
assert.equal(capacityStart.getFeasible(), true);
capacityStart.setQuantity(7);
assert.equal(capacityStart.getQuantity(), 2);
capacityStart.setConfirmed(true);
capacityStart.setQuantity(1.5);
assert.deepEqual([capacityStart.getQuantity(), capacityEnd.getQuantity()], [1.5, -1.5]);
capacityStart.setStatus("closed");
assert.deepEqual([capacityStart.getClosed(), capacityStart.getStatus()], [true, "closed"]);

const capacityPool = new ResourceDefault("loadplan-pool");
const assignedCapacity = new ResourceDefault("loadplan-assigned");
const candidateCapacity = new ResourceDefault("loadplan-candidate");
assignedCapacity.setOwner(capacityPool);
candidateCapacity.setOwner(capacityPool);
const pooledCapacityLoad = new LoadDefault(capacityOperation, capacityPool, 1);
pooledCapacityLoad.setName("pooled-choice");
const pooledCapacityPlan = new OperationPlan(capacityOperation);
pooledCapacityPlan.setStartEndAndQuantity("2026-08-21T08:00:00", "2026-08-21T16:00:00", 1);
const pooledCapacityStart = new LoadPlan(pooledCapacityPlan, pooledCapacityLoad, assignedCapacity);
assert.deepEqual([...pooledCapacityStart.getAlternates()], [candidateCapacity]);

const bucketedCapacity = new ResourceBuckets("loadplan-bucket-resource");
const bucketedCalendar = new CalendarDefault("loadplan-bucket-calendar");
bucketedCalendar.setDefault(0);
bucketedCalendar.setValue("2026-08-20T00:00:00", "2026-08-21T00:00:00", 8);
bucketedCapacity.setMaximumCalendar(bucketedCalendar);
const bucketedLoad = new LoadBucketizedPercentage(capacityOperation, bucketedCapacity, 1);
const bucketedPlan = new OperationPlan(capacityOperation);
bucketedPlan.setStartEndAndQuantity("2026-08-20T00:00:00", "2026-08-21T00:00:00", 4);
const bucketedLoadPlan = new LoadPlan(bucketedPlan, bucketedLoad);
assert.equal(bucketedLoadPlan.getOtherLoadPlan(), null);
assert.equal(bucketedPlan.sizeLoadPlans(), 1);
assert.equal(bucketedLoadPlan.getQuantity(), -4);
assert.equal(bucketedLoadPlan.getBucketStart()[1].toString(), "2026-08-20T00:00:00");
assert.equal(bucketedLoadPlan.getBucketEnd()[1].toString(), "2026-08-21T00:00:00");
assert.equal(bucketedLoadPlan.getFeasible(), true);

capacityStart.dispose();
assert.equal(capacityPlan.sizeLoadPlans(), 0);
assert.equal(alternateCapacity.getLoadPlans().includes(capacityStart), false);
pooledCapacityStart.dispose();
bucketedLoadPlan.dispose();
for (const value of [capacityPlan, pooledCapacityPlan, bucketedPlan, capacityLoad, pooledCapacityLoad,
  bucketedLoad, primaryCapacity, alternateCapacity, assignedCapacity, candidateCapacity, capacityPool,
  bucketedCapacity, bucketedCalendar, capacityOperation]) value.dispose();

leadingLoad.dispose();
assert.equal(loadOperation.getLoads().includes(leadingLoad), false);
assert.equal(loadResource.getLoads().includes(leadingLoad), false);
for (const value of [alternateLoad, invalidBucketLoad, percentLoad, fromStartLoad, fromEndLoad, poolLoad,
  bucketLoadPlan, quantityLoadPlan, loadPlanStart, preferredPlan]) value.dispose();
for (const value of [preferredSkill, preferredPool, lessEfficient, moreEfficient, loadOperation, loadResource, alternateResource]) value.dispose();

const routingOperation = new OperationRouting("semantic-routing");
const routingFirst = new Operation("semantic-routing-first");
const routingSecond = new Operation("semantic-routing-second");
const firstStep = new SubOperation(routingFirst, routingOperation, 20,
  new DateRange(new PlanningDate("2026-01-01T00:00:00"), new PlanningDate("2027-01-01T00:00:00")));
const secondStep = SubOperation.create({ operation: routingSecond, owner: routingOperation, priority: 10, source: "fixture" });
assert.deepEqual(routingOperation.getSubOperations(), [secondStep, firstStep]);
assert.deepEqual([...new SubOperationIterator(routingOperation)], [secondStep, firstStep]);
assert.equal(firstStep.getEffectiveStart().toString(), "2026-01-01T00:00:00");
assert.equal(secondStep.getSource(), "fixture");
firstStep.setPriority(5);
assert.deepEqual(routingOperation.getSubOperations(), [firstStep, secondStep]);
secondStep.dispose();
assert.deepEqual(routingOperation.getSubOperations(), [firstStep]);
routingFirst.dispose();
assert.equal(firstStep.getOperation(), null);
firstStep.dispose();
routingSecond.dispose();
routingOperation.dispose();

const dependencySource = new Operation("dependency-source");
const dependencyTarget = new Operation("dependency-target");
const staticDependency = new OperationDependency(dependencyTarget, dependencySource, 2);
staticDependency.setSafetyLeadtime("P1D");
staticDependency.setHardSafetyLeadtime("PT12H");
assert.deepEqual([...new OperationDependencyIterator(dependencyTarget, true)], [staticDependency]);
assert.deepEqual([...new OperationDependencyIterator(dependencySource)], [staticDependency]);
assert.equal(staticDependency.getSafetyLeadtime().seconds, 86_400);
assert.throws(() => new OperationDependency(dependencyTarget, dependencySource), /Duplicate dependency/);
assert.throws(() => new OperationDependency(dependencySource, dependencyTarget), /Looping blocked-by dependency/);

const dependencySourcePlan = new OperationPlan(dependencySource);
dependencySourcePlan.setStartEndAndQuantity("2026-08-20T00:00:00", "2026-08-21T00:00:00", 10);
const dependencyTargetPlan = new OperationPlan(dependencyTarget);
dependencyTargetPlan.setStartEndAndQuantity("2026-08-22T00:00:00", "2026-08-23T00:00:00", 4);
dependencyTargetPlan.matchDependencies();
const concreteDependencies = dependencySourcePlan.getDependencies();
assert.equal(concreteDependencies.length, 1);
assert.equal(concreteDependencies[0] instanceof OperationPlanDependency, true);
assert.deepEqual([...new OperationPlanDependencyIterator(dependencySourcePlan)], concreteDependencies);
assert.deepEqual([...new OperationPlanDependencyIterator(dependencyTargetPlan, true)], concreteDependencies);
assert.equal(concreteDependencies[0].getQuantity(), 8);
concreteDependencies[0].dispose();
assert.deepEqual(dependencySourcePlan.getDependencies(), []);
staticDependency.dispose();
assert.deepEqual(dependencyTarget.getDependencies(), []);
for (const value of [dependencySourcePlan, dependencyTargetPlan, dependencySource, dependencyTarget]) value.dispose();

// Isolate the level/cluster fixture from model objects intentionally retained
// by earlier lifecycle tests, including native-style auto delivery operations.
Demand.clear();
Operation.clear();
Buffer.clear();
Resource.clear();
Item.clear();
Location.clear();

const levelItem = new ItemMTS("level-item");
const levelLocation = new LocationDefault("level-location");
const levelBuffer = new Buffer("level-buffer");
levelBuffer.setItem(levelItem);
levelBuffer.setLocation(levelLocation);
const levelSiblingBuffer = new Buffer("level-sibling-buffer");
levelSiblingBuffer.setItem(levelItem);
levelSiblingBuffer.setLocation(levelLocation);
levelSiblingBuffer.setBatch("B1");
const levelProducer = new Operation("level-producer");
const levelConsumer = new Operation("level-consumer");
const levelResourcePeer = new Operation("level-resource-peer");
const levelDangling = new Operation("level-dangling");
const levelProducerFlow = new FlowEnd(levelProducer, levelBuffer, 1);
const levelConsumerFlow = new FlowStart(levelConsumer, levelBuffer, -1);
const levelResourceRoot = new ResourceDefault("level-resource-root");
const levelResourceChild = new ResourceDefault("level-resource-child");
levelResourceChild.setOwner(levelResourceRoot);
const levelConsumerLoad = new LoadDefault(levelConsumer, levelResourceChild, 1);
const levelPeerLoad = new LoadDefault(levelResourcePeer, levelResourceRoot, 1);
HasLevel.triggerLazyRecomputation();
assert.equal(HasLevel.getNumberOfClusters(), 1);
assert.equal(HasLevel.getNumberOfLevels(), 1);
assert.deepEqual([
  levelConsumer.getLevel(), levelBuffer.getLevel(), levelProducer.getLevel(),
  levelDangling.getLevel(), levelDangling.getCluster(),
], [0, 1, 1, 0, 0]);
assert.equal(levelProducer.getCluster(), levelConsumer.getCluster());
assert.equal(levelResourcePeer.getCluster(), levelConsumer.getCluster());
assert.equal(levelResourceRoot.getCluster(), levelConsumer.getCluster());
assert.equal(levelResourceChild.getCluster(), levelConsumer.getCluster());
assert.deepEqual([
  levelSiblingBuffer.getCluster(), levelSiblingBuffer.getLevel(),
], [levelBuffer.getCluster(), levelBuffer.getLevel()]);
for (const value of [levelProducerFlow, levelConsumerFlow, levelConsumerLoad, levelPeerLoad,
  levelBuffer, levelSiblingBuffer, levelProducer, levelConsumer, levelResourcePeer, levelDangling,
  levelResourceChild, levelResourceRoot, levelItem, levelLocation]) value.dispose();

const commandOperation = new Operation("command-operation");
const createCommand = new CommandCreateOperationPlan(commandOperation, 3,
  "2026-09-01T00:00:00", "2026-09-02T00:00:00");
const createdPlan = createCommand.getOperationPlan();
assert.ok(createdPlan);
assert.equal([...commandOperation.getOperationPlans()].includes(createdPlan), false);
createCommand.commit();
assert.equal(createCommand.getOperationPlan(), null);
assert.equal([...commandOperation.getOperationPlans()].includes(createdPlan), true);

const rollbackCreate = new CommandCreateOperationPlan(commandOperation, 2,
  "2026-09-03T00:00:00", "2026-09-04T00:00:00");
const rolledBackPlan = rollbackCreate.getOperationPlan();
rollbackCreate.rollback();
assert.equal([...commandOperation.getOperationPlans()].includes(rolledBackPlan), false);

const deleteRollback = new CommandDeleteOperationPlan(createdPlan);
assert.equal([...commandOperation.getOperationPlans()].includes(createdPlan), false);
deleteRollback.rollback();
assert.equal([...commandOperation.getOperationPlans()].includes(createdPlan), true);
createdPlan.setConfirmed(true);
assert.throws(() => new CommandDeleteOperationPlan(createdPlan), /locked operationplan/);
createdPlan.setProposed(true);

const moveChild = new OperationPlan(commandOperation);
moveChild.setStartEndAndQuantity("2026-09-01T06:00:00", "2026-09-01T18:00:00", 1);
moveChild.setOwner(createdPlan);
const moveCommand = new CommandMoveOperationPlan(createdPlan,
  "2026-10-01T00:00:00", "2026-10-02T00:00:00", 6);
assert.equal(createdPlan.getQuantity(), 6);
moveChild.setStartEndAndQuantity("2026-10-01T06:00:00", "2026-10-01T18:00:00", 2);
moveCommand.rollback();
assert.deepEqual([
  createdPlan.getStart().toString(), createdPlan.getEnd().toString(), createdPlan.getQuantity(),
  moveChild.getStart().toString(), moveChild.getEnd().toString(), moveChild.getQuantity(),
], [
  "2026-09-01T00:00:00", "2026-09-02T00:00:00", 3,
  "2026-09-01T06:00:00", "2026-09-01T18:00:00", 1,
]);
const moveCommit = new CommandMoveOperationPlan(createdPlan,
  "2026-11-01T00:00:00", "2026-11-02T00:00:00", 5);
moveCommit.commit();
assert.equal(createdPlan.getQuantity(), 5);
const deleteCommit = new CommandDeleteOperationPlan(createdPlan);
deleteCommit.commit();
assert.equal([...commandOperation.getOperationPlans()].includes(createdPlan), false);
commandOperation.dispose();

// Stage 6: native fixed-time operationplan consolidation rules.
const mergeBuffer = new Buffer("stage6-merge-buffer");
const mergeOperation = new OperationFixedTime("stage6-merge-operation");
mergeOperation.setDuration(3_600);
mergeOperation.setSizeMaximum(10);
const mergeFlow = new FlowEnd(mergeOperation, mergeBuffer, 1);
const mergeFirst = new OperationPlan(mergeOperation);
mergeFirst.setStartEndAndQuantity("2026-12-01T00:00:00", "2026-12-01T01:00:00", 3);
mergeFirst.createFlowLoads();
mergeFirst.activate();
const mergeSecond = new OperationPlan(mergeOperation);
mergeSecond.setStartEndAndQuantity("2026-12-01T00:00:00", "2026-12-01T01:00:00", 4);
mergeSecond.createFlowLoads();
mergeSecond.activate();
assert.equal(mergeSecond.mergeIfPossible(), true);
assert.equal(mergeFirst.getQuantity(), 7);
assert.deepEqual([...mergeOperation.getOperationPlans()], [mergeFirst]);

Plan.instance().setAllowMergingOperationPlans(false);
const mergeDisabled = new OperationPlan(mergeOperation);
mergeDisabled.setStartEndAndQuantity("2026-12-01T00:00:00", "2026-12-01T01:00:00", 2);
mergeDisabled.createFlowLoads();
mergeDisabled.activate();
assert.equal(mergeDisabled.mergeIfPossible(), false);
Plan.instance().setAllowMergingOperationPlans(true);
mergeDisabled.dispose();

const mergeAtMaximum = new OperationPlan(mergeOperation);
mergeAtMaximum.setStartEndAndQuantity("2026-12-01T00:00:00", "2026-12-01T01:00:00", 3);
mergeAtMaximum.createFlowLoads();
mergeAtMaximum.activate();
assert.equal(mergeAtMaximum.mergeIfPossible(), true);
assert.equal(mergeFirst.getQuantity(), 10);

const fixedMergeOperation = new OperationFixedTime("stage6-fixed-flow-merge");
fixedMergeOperation.setDuration(3_600);
const fixedMergeFlow = new FlowEnd(fixedMergeOperation, mergeBuffer, 1);
fixedMergeFlow.setQuantityFixed(1);
const fixedMergeFirst = new OperationPlan(fixedMergeOperation);
fixedMergeFirst.setStartEndAndQuantity("2026-12-02T00:00:00", "2026-12-02T01:00:00", 2);
fixedMergeFirst.createFlowLoads();
fixedMergeFirst.activate();
const fixedMergeSecond = new OperationPlan(fixedMergeOperation);
fixedMergeSecond.setStartEndAndQuantity("2026-12-02T00:00:00", "2026-12-02T01:00:00", 2);
fixedMergeSecond.createFlowLoads();
fixedMergeSecond.activate();
assert.equal(fixedMergeSecond.mergeIfPossible(), false);

const defaultResourceOperation = new OperationFixedTime("stage6-default-resource-merge");
defaultResourceOperation.setDuration(3_600);
const defaultResource = new ResourceDefault("stage6-default-resource");
const defaultLoad = new LoadDefault(defaultResourceOperation, defaultResource, 1);
const defaultFlow = new FlowEnd(defaultResourceOperation, mergeBuffer, 1);
const defaultPlanFirst = new OperationPlan(defaultResourceOperation);
defaultPlanFirst.setStartEndAndQuantity("2026-12-03T00:00:00", "2026-12-03T01:00:00", 2);
defaultPlanFirst.createFlowLoads();
defaultPlanFirst.activate();
const defaultPlanSecond = new OperationPlan(defaultResourceOperation);
defaultPlanSecond.setStartEndAndQuantity("2026-12-03T00:00:00", "2026-12-03T01:00:00", 2);
defaultPlanSecond.createFlowLoads();
defaultPlanSecond.activate();
assert.equal(defaultPlanSecond.mergeIfPossible(), false);

// Creation-time consolidation is independent of the global move-merge switch
// and uses a strict sizeMaximum boundary, as OperationFixedTime does natively.
const creationBuffer = new Buffer("stage6-creation-buffer");
const creationOperation = new OperationFixedTime("stage6-creation-operation");
creationOperation.setDuration(3_600);
creationOperation.setSizeMaximum(10);
const creationFlow = new FlowEnd(creationOperation, creationBuffer, 1);
const creationFirst = new CommandCreateOperationPlan(creationOperation, 3,
  "2026-12-04T00:00:00", "2026-12-04T01:00:00");
creationFirst.commit();
Plan.instance().setAllowMergingOperationPlans(false);
const creationSecond = new CommandCreateOperationPlan(creationOperation, 4,
  "2026-12-04T00:00:00", "2026-12-04T01:00:00");
creationSecond.commit();
assert.deepEqual([...creationOperation.getOperationPlans()].map((plan) => plan.getQuantity()), [7]);
const creationAtMaximum = new CommandCreateOperationPlan(creationOperation, 3,
  "2026-12-04T00:00:00", "2026-12-04T01:00:00");
creationAtMaximum.commit();
assert.deepEqual([...creationOperation.getOperationPlans()].map((plan) => plan.getQuantity()).sort(), [3, 7]);
Plan.instance().setAllowMergingOperationPlans(true);

// Minimum, maximum, fixed quantity and lot multiples all participate in isExcess.
const excessBuffer = new Buffer("stage6-excess-buffer");
const excessOperation = new OperationFixedTime("stage6-excess-operation");
excessOperation.setDuration(3_600);
const excessFlow = new FlowEnd(excessOperation, excessBuffer, 1);
const excessPlan = new OperationPlan(excessOperation);
excessPlan.setStartEndAndQuantity("2026-12-05T00:00:00", "2026-12-05T01:00:00", 10);
excessPlan.createFlowLoads();
excessPlan.activate();
assert.equal(excessPlan.isExcess(), 10);
excessBuffer.setMinimum(4);
assert.equal(excessPlan.isExcess(), 6);
assert.equal(excessPlan.isExcess(true), 10);
excessBuffer.setMaximum(8);
assert.equal(excessPlan.isExcess(), 2);
excessBuffer.setMaximum(0);
excessFlow.setQuantityFixed(2);
excessPlan.setQuantity(10);
assert.equal(excessPlan.isExcess(), 6);
excessOperation.setSizeMultiple(7);
assert.equal(excessPlan.isExcess(), 0);
excessOperation.setSizeMultiple(0);

const dependentExcessPlan = new OperationPlan(excessOperation);
dependentExcessPlan.setStartEndAndQuantity("2026-12-06T00:00:00", "2026-12-06T01:00:00", 2);
dependentExcessPlan.createFlowLoads();
dependentExcessPlan.activate();
new OperationPlanDependency(excessPlan, dependentExcessPlan);
assert.equal(dependentExcessPlan.isExcess(), 0);

// Command manager scans only active bookmarks and rolls inactive bookmark
// commands back when committing, matching the native CommandList destructor.
const commandScopeOperation = new OperationFixedTime("stage6-command-scope");
commandScopeOperation.setDuration(3_600);
const commandScopeBuffer = new Buffer("stage6-command-scope-buffer");
const commandScopeFlow = new FlowEnd(commandScopeOperation, commandScopeBuffer, 1);
const inactiveManager = new CommandManager();
const inactiveBookmark = inactiveManager.setBookmark();
const inactiveCommand = new CommandCreateOperationPlan(commandScopeOperation, 3,
  "2026-12-07T00:00:00", "2026-12-07T01:00:00");
inactiveManager.add(inactiveCommand);
inactiveBookmark.active = false;
assert.equal(hasOperationPlansSemantic(inactiveManager), false);
assert.equal(inactiveManager.empty(), false);
inactiveManager.commit();
assert.equal(inactiveCommand.getOperationPlan(), null);
assert.deepEqual([...commandScopeOperation.getOperationPlans()], []);

const excessManager = new CommandManager();
const excessBookmark = excessManager.setBookmark();
const redundantCommand = new CommandCreateOperationPlan(commandScopeOperation, 3,
  "2026-12-08T00:00:00", "2026-12-08T01:00:00");
const redundantPlan = redundantCommand.getOperationPlan();
excessManager.add(redundantCommand);
redundantPlan.activate();
assert.equal(hasOperationPlansSemantic(excessManager), true);
scanExcessSemantic(excessManager);
assert.equal(redundantCommand.getOperationPlan(), null);
assert.deepEqual([...commandScopeOperation.getOperationPlans()], []);

// A routing child has no independent create command. Committing the top-level
// command recursively activates the complete owned tree.
const ownedRouting = new OperationRouting("stage6-owned-routing");
const ownedStep = new OperationFixedTime("stage6-owned-routing-step");
ownedStep.setDuration(3_600);
const ownedAssociation = new SubOperation(ownedStep, ownedRouting, 1);
const ownedManager = new CommandManager();
const ownedCommand = new CommandCreateOperationPlan(ownedRouting, 2,
  "2026-12-09T00:00:00", "2026-12-09T01:00:00", null, "", null, false);
const ownedTop = ownedCommand.getOperationPlan();
assert.ok(ownedTop);
const ownedChild = new OperationPlan(ownedStep);
ownedChild.setStartEndAndQuantity("2026-12-09T00:00:00", "2026-12-09T01:00:00", 2);
ownedChild.setOwner(ownedTop, true);
ownedManager.add(ownedCommand);
assert.equal([...ownedManager].flatMap((entry) => [...entry]).length, 1);
ownedManager.commit();
assert.equal(ownedTop.getActivated(), true);
assert.equal(ownedChild.getActivated(), true);
assert.deepEqual([...ownedTop.getSubOperationPlans()], [ownedChild]);

// Alternate-owned plans merge only for the same alternate owner operation and
// owner demand. This mirrors both creation-time and move-time native guards.
const stage6AlternateOperation = new OperationAlternate("stage6-alternate-owner");
const alternateChildOperation = new OperationFixedTime("stage6-alternate-child");
alternateChildOperation.setDuration(3_600);
alternateChildOperation.setSizeMaximum(20);
const alternateBuffer = new Buffer("stage6-alternate-buffer");
const alternateFlow = new FlowEnd(alternateChildOperation, alternateBuffer, 1);
const alternateDemand = new DemandDefault("stage6-alternate-demand");
const alternateOwnerFirst = new OperationPlan(stage6AlternateOperation);
alternateOwnerFirst.setDemand(alternateDemand);
const alternateOwnerSecond = new OperationPlan(stage6AlternateOperation);
alternateOwnerSecond.setDemand(alternateDemand);
const alternateFirst = new OperationPlan(alternateChildOperation);
alternateFirst.setStartEndAndQuantity("2026-12-10T00:00:00", "2026-12-10T01:00:00", 3);
alternateFirst.setOwner(alternateOwnerFirst);
alternateFirst.createFlowLoads();
alternateFirst.activate();
const alternateSecond = new OperationPlan(alternateChildOperation);
alternateSecond.setStartEndAndQuantity("2026-12-10T00:00:00", "2026-12-10T01:00:00", 4);
alternateSecond.setOwner(alternateOwnerSecond);
alternateSecond.createFlowLoads();
alternateSecond.activate();
assert.equal(alternateSecond.mergeIfPossible(), true);
assert.equal(alternateFirst.getQuantity(), 7);

const differentOwnerDemand = new DemandDefault("stage6-alternate-other-demand");
const alternateOwnerThird = new OperationPlan(stage6AlternateOperation);
alternateOwnerThird.setDemand(differentOwnerDemand);
const alternateThird = new OperationPlan(alternateChildOperation);
alternateThird.setStartEndAndQuantity("2026-12-10T00:00:00", "2026-12-10T01:00:00", 2);
alternateThird.setOwner(alternateOwnerThird);
alternateThird.createFlowLoads();
alternateThird.activate();
assert.equal(alternateThird.mergeIfPossible(), false);

// OperationFixedTime::extraInstantiate intentionally treats the candidate
// before and after the insertion point differently for fixed flows.
const asymmetricBuffer = new Buffer("stage6-asymmetric-buffer");
const previousFixedOperation = new OperationFixedTime("stage6-previous-fixed-flow");
previousFixedOperation.setDuration(3_600);
previousFixedOperation.setSizeMaximum(20);
const previousFixedFlow = new FlowEnd(previousFixedOperation, asymmetricBuffer, 1);
previousFixedFlow.setQuantityFixed(1);
const previousFixedCandidate = new OperationPlan(previousFixedOperation);
previousFixedCandidate.setStartEndAndQuantity("2026-12-11T00:00:00", "2026-12-11T01:00:00", 5);
previousFixedCandidate.createFlowLoads();
previousFixedCandidate.activate();
const previousFixedNew = new OperationPlan(previousFixedOperation);
previousFixedNew.setStartEndAndQuantity("2026-12-11T00:00:00", "2026-12-11T01:00:00", 3);
previousFixedNew.createFlowLoads();
assert.equal(previousFixedNew.mergeForCreation(), false);

const nextFixedOperation = new OperationFixedTime("stage6-next-fixed-flow");
nextFixedOperation.setDuration(3_600);
nextFixedOperation.setSizeMaximum(20);
const nextFixedFlow = new FlowEnd(nextFixedOperation, asymmetricBuffer, 1);
nextFixedFlow.setQuantityFixed(1);
const nextFixedCandidate = new OperationPlan(nextFixedOperation);
nextFixedCandidate.setStartEndAndQuantity("2026-12-12T00:00:00", "2026-12-12T01:00:00", 2);
nextFixedCandidate.createFlowLoads();
nextFixedCandidate.activate();
const nextFixedNew = new OperationPlan(nextFixedOperation);
nextFixedNew.setStartEndAndQuantity("2026-12-12T00:00:00", "2026-12-12T01:00:00", 3);
nextFixedNew.createFlowLoads();
assert.equal(nextFixedNew.mergeForCreation(), true);
assert.equal(nextFixedCandidate.getQuantity(), 5);

const demandExcessPlan = new OperationPlan(excessOperation);
demandExcessPlan.setStartEndAndQuantity("2026-12-13T00:00:00", "2026-12-13T01:00:00", 3);
demandExcessPlan.setDemand(new DemandDefault("stage6-excess-demand"));
demandExcessPlan.createFlowLoads();
demandExcessPlan.activate();
assert.equal(demandExcessPlan.isExcess(), 0);
const deletedFlowPlan = new OperationPlan(excessOperation);
deletedFlowPlan.setStartEndAndQuantity("2026-12-14T00:00:00", "2026-12-14T01:00:00", 3);
deletedFlowPlan.createFlowLoads();
deletedFlowPlan.activate();
deletedFlowPlan.deleteFlowLoads();
assert.equal(deletedFlowPlan.isExcess(), 0);

// A newly created earlier plan can make a later proposed plan redundant. PO
// operations are explicitly excluded from this secondary cleanup scan.
const laterBuffer = new Buffer("stage6-later-excess-buffer");
laterBuffer.setOnHand(3);
laterBuffer.setMinimum(3);
const laterOperation = new OperationFixedTime("stage6-later-excess-operation");
laterOperation.setDuration(3_600);
const laterFlow = new FlowEnd(laterOperation, laterBuffer, 1);
const laterRedundant = new OperationPlan(laterOperation);
laterRedundant.setStartEndAndQuantity("2026-12-20T00:00:00", "2026-12-20T01:00:00", 2);
laterRedundant.createFlowLoads();
laterRedundant.activate();
const laterManager = new CommandManager();
const earlierCommand = new CommandCreateOperationPlan(laterOperation, 3,
  "2026-12-15T00:00:00", "2026-12-15T01:00:00");
const earlierPlan = earlierCommand.getOperationPlan();
laterManager.add(earlierCommand);
earlierPlan.activate();
assert.equal(earlierPlan.isExcess(), earlierPlan.getQuantity());
assert.equal(laterRedundant.isExcess(), laterRedundant.getQuantity());
// Keep the create command in scope while treating its plan as required. The
// secondary scan must still remove the later redundant supply.
earlierPlan.setDemand(new DemandDefault("stage6-earlier-required-demand"));
scanExcessSemantic(laterManager);
assert.equal([...laterOperation.getOperationPlans()].includes(laterRedundant), false);
laterManager.rollback();

const poItem = new ItemMTS("stage6-po-item");
const poSupplier = new SupplierDefault("stage6-po-supplier");
const poLocation = new LocationDefault("stage6-po-supplier");
const poBuffer = new Buffer("stage6-po-buffer");
poBuffer.setItem(poItem);
poBuffer.setLocation(poLocation);
poBuffer.setOnHand(3);
poBuffer.setMinimum(3);
const poAssociation = new ItemSupplier(poSupplier, poItem);
const poOperation = OperationItemSupplier.findOrCreate(poAssociation, poBuffer);
const laterPo = new OperationPlan(poOperation);
laterPo.setStartEndAndQuantity("2026-12-20T00:00:00", "2026-12-20T01:00:00", 2);
laterPo.createFlowLoads();
laterPo.activate();
const poManager = new CommandManager();
const earlierPoCommand = new CommandCreateOperationPlan(poOperation, 3,
  "2026-12-15T00:00:00", "2026-12-15T01:00:00");
const earlierPo = earlierPoCommand.getOperationPlan();
poManager.add(earlierPoCommand);
earlierPo.activate();
scanExcessSemantic(poManager);
assert.equal([...poOperation.getOperationPlans()].includes(laterPo), true);
poManager.rollback();

// The embedded first bookmark can be inactive too. Native commit leaves its
// commands untouched; an explicit manager rollback remains responsible for it.
const firstInactiveManager = new CommandManager();
const firstInactiveBookmark = [...firstInactiveManager][0];
const firstInactiveCommand = new CommandCreateOperationPlan(commandScopeOperation, 2,
  "2026-12-16T00:00:00", "2026-12-16T01:00:00");
firstInactiveManager.add(firstInactiveCommand);
firstInactiveBookmark.active = false;
assert.equal(hasOperationPlansSemantic(firstInactiveManager), false);
firstInactiveManager.commit();
assert.ok(firstInactiveCommand.getOperationPlan());
assert.equal(firstInactiveManager.empty(), true);
firstInactiveManager.rollback();
assert.equal(firstInactiveCommand.getOperationPlan(), null);

const minCalendar = new CalendarDefault("stage6-min-calendar");
minCalendar.setDefault(2);
minCalendar.setValue("2026-12-18T00:00:00", "2026-12-20T00:00:00", 6);
const maxCalendar = new CalendarDefault("stage6-max-calendar");
maxCalendar.setDefault(9);
maxCalendar.setValue("2026-12-19T00:00:00", "2026-12-21T00:00:00", 4);
const calendarExcessBuffer = new Buffer("stage6-calendar-excess-buffer");
calendarExcessBuffer.setMinimumCalendar(minCalendar);
calendarExcessBuffer.setMaximumCalendar(maxCalendar);
const minMaxCalendarEvents = calendarExcessBuffer.getFlowPlans()
  .filter((event) => event.getEventType() === 3 || event.getEventType() === 4);
assert.ok(minMaxCalendarEvents.filter((event) => event.getEventType() === 3).length >= 3);
assert.ok(minMaxCalendarEvents.filter((event) => event.getEventType() === 4).length >= 3);
assert.deepEqual([...calendarExcessBuffer.getFlowPlanIterator()], []);
assert.equal(minMaxCalendarEvents.some((event) => event.getEventType() === 3
  && event.getDate().toString() === "2026-12-18T00:00:00" && event.getMin() === 6), true);
assert.equal(minMaxCalendarEvents.some((event) => event.getEventType() === 4
  && event.getDate().toString() === "2026-12-19T00:00:00" && event.getMax() === 4), true);

// A maximum calendar is a ceiling for excess detection, not a replenishment
// target. Supply below the active high ceiling is required; after the calendar
// falls back, the same quantity is fully excess and can be scanned away.
const insideMaximumCalendar = new CalendarDefault("stage6-inside-maximum-calendar");
insideMaximumCalendar.setDefault(3);
insideMaximumCalendar.setValue("2026-12-18T00:00:00", "2026-12-22T00:00:00", 6);
const insideMaximumBuffer = new Buffer("stage6-inside-maximum-buffer");
insideMaximumBuffer.setOnHand(3);
insideMaximumBuffer.setMaximumCalendar(insideMaximumCalendar);
const insideMaximumOperation = new OperationFixedTime("stage6-inside-maximum-operation");
insideMaximumOperation.setDuration(3_600);
const insideMaximumFlow = new FlowEnd(insideMaximumOperation, insideMaximumBuffer, 1);
const insideMaximumPlan = new OperationPlan(insideMaximumOperation);
insideMaximumPlan.setStartEndAndQuantity("2026-12-20T00:00:00", "2026-12-20T01:00:00", 2);
insideMaximumPlan.createFlowLoads();
insideMaximumPlan.activate();
assert.equal(insideMaximumPlan.isExcess(), 0);

const fallenMaximumCalendar = new CalendarDefault("stage6-fallen-maximum-calendar");
fallenMaximumCalendar.setDefault(3);
fallenMaximumCalendar.setValue("2026-12-18T00:00:00", "2026-12-22T00:00:00", 6);
const fallenMaximumBuffer = new Buffer("stage6-fallen-maximum-buffer");
fallenMaximumBuffer.setOnHand(3);
fallenMaximumBuffer.setMaximumCalendar(fallenMaximumCalendar);
const fallenMaximumOperation = new OperationFixedTime("stage6-fallen-maximum-operation");
fallenMaximumOperation.setDuration(3_600);
const fallenMaximumFlow = new FlowEnd(fallenMaximumOperation, fallenMaximumBuffer, 1);
const fallenMaximumPlan = new OperationPlan(fallenMaximumOperation);
fallenMaximumPlan.setStartEndAndQuantity("2026-12-22T05:00:00", "2026-12-22T06:00:00", 2);
fallenMaximumPlan.createFlowLoads();
fallenMaximumPlan.activate();
assert.equal(fallenMaximumPlan.isExcess(), 2);
const fallenMaximumManager = new CommandManager();
const requiredEarlierCommand = new CommandCreateOperationPlan(fallenMaximumOperation, 3,
  "2026-12-15T00:00:00", "2026-12-15T01:00:00");
const requiredEarlierPlan = requiredEarlierCommand.getOperationPlan();
fallenMaximumManager.add(requiredEarlierCommand);
requiredEarlierPlan.activate();
requiredEarlierPlan.setDemand(new DemandDefault("stage6-fallen-maximum-required-demand"));
scanExcessSemantic(fallenMaximumManager);
assert.equal([...fallenMaximumOperation.getOperationPlans()].includes(fallenMaximumPlan), false);
fallenMaximumManager.rollback();

// Native OperationPlan::deleteOperationPlans removes proposed plans only by
// default. Selecting a routing child operation still deletes the complete
// proposed owner tree, exactly like deleting the C++ child object.
const deletionStatusOperation = new OperationFixedTime("stage6-deletion-status-operation");
const deletionProposed = new OperationPlan(deletionStatusOperation);
const deletionApproved = new OperationPlan(deletionStatusOperation);
deletionApproved.setStatus("approved", false, false);
const deletionConfirmed = new OperationPlan(deletionStatusOperation);
deletionConfirmed.setStatus("confirmed", false, false);
deletionStatusOperation.deleteOperationPlans(false);
assert.deepEqual([...deletionStatusOperation.getOperationPlans()], [deletionApproved, deletionConfirmed]);

const deletionRouting = new OperationRouting("stage6-deletion-routing");
const deletionStep = new OperationFixedTime("stage6-deletion-step");
const deletionAssociation = new SubOperation(deletionStep, deletionRouting, 1);
const deletionOwner = new OperationPlan(deletionRouting);
const deletionChild = new OperationPlan(deletionStep);
deletionChild.setOwner(deletionOwner, true);
deletionStep.deleteOperationPlans(false);
assert.equal([...deletionRouting.getOperationPlans()].includes(deletionOwner), false);
assert.equal([...deletionStep.getOperationPlans()].includes(deletionChild), false);

for (const value of [mergeFirst, fixedMergeFirst, fixedMergeSecond, defaultPlanFirst, defaultPlanSecond,
  dependentExcessPlan, excessPlan, ownedTop, alternateOwnerFirst, alternateOwnerSecond, alternateOwnerThird,
  alternateFirst, alternateThird, previousFixedCandidate, previousFixedNew, nextFixedCandidate,
  demandExcessPlan, deletedFlowPlan, laterRedundant, laterPo, insideMaximumPlan, fallenMaximumPlan,
  deletionApproved, deletionConfirmed]) value.dispose();
for (const value of [mergeFlow, fixedMergeFlow, defaultLoad, defaultFlow, creationFlow, excessFlow,
  commandScopeFlow, alternateFlow, previousFixedFlow, nextFixedFlow, laterFlow, ownedAssociation,
  insideMaximumFlow, fallenMaximumFlow, deletionAssociation,
  mergeOperation, fixedMergeOperation, defaultResourceOperation, creationOperation,
  excessOperation, commandScopeOperation, ownedRouting, ownedStep, stage6AlternateOperation,
  alternateChildOperation, previousFixedOperation, nextFixedOperation, laterOperation,
  defaultResource, mergeBuffer, creationBuffer, excessBuffer, commandScopeBuffer, alternateBuffer,
  asymmetricBuffer, laterBuffer, calendarExcessBuffer, minCalendar, maxCalendar, poOperation,
  poAssociation, poBuffer, poItem, poSupplier, poLocation, insideMaximumOperation,
  insideMaximumBuffer, insideMaximumCalendar, fallenMaximumOperation, fallenMaximumBuffer,
  fallenMaximumCalendar, deletionStatusOperation, deletionRouting, deletionStep]) value.dispose();

const shortageBuffer = new Buffer("problem-shortage-buffer");
const shortageStartEvent = new HeaderModelAdapter();
shortageStartEvent.setDate(new PlanningDate("2026-08-20T00:00:00"));
shortageStartEvent.setEventType(1);
shortageStartEvent.setOnhand(-5);
const shortageWorstEvent = new HeaderModelAdapter();
shortageWorstEvent.setDate(new PlanningDate("2026-08-21T00:00:00"));
shortageWorstEvent.setEventType(1);
shortageWorstEvent.setOnhand(-8);
const shortageEndEvent = new HeaderModelAdapter();
shortageEndEvent.setDate(new PlanningDate("2026-08-22T00:00:00"));
shortageEndEvent.setEventType(1);
shortageEndEvent.setOnhand(0);
shortageBuffer.setFlowPlans([shortageStartEvent, shortageWorstEvent, shortageEndEvent]);
shortageBuffer.setChanged(true);
const shortageProblems = shortageBuffer.getProblems();
assert.equal(shortageProblems.length, 1);
assert.equal(shortageProblems[0] instanceof ProblemMaterialShortage, true);
assert.deepEqual([
  shortageProblems[0].getStart().toString(), shortageProblems[0].getEnd().toString(),
  shortageProblems[0].getQuantity(),
], ["2026-08-20T00:00:00", "2026-08-22T00:00:00", 8]);

const overloadResource = new ResourceDefault("problem-overload-resource");
overloadResource.setMaximum(2);
const overloadStartEvent = new HeaderModelAdapter();
overloadStartEvent.setDate(new PlanningDate("2026-08-20T08:00:00"));
overloadStartEvent.setEventType(1);
overloadStartEvent.setOnhand(5);
const overloadEndEvent = new HeaderModelAdapter();
overloadEndEvent.setDate(new PlanningDate("2026-08-20T16:00:00"));
overloadEndEvent.setEventType(1);
overloadEndEvent.setOnhand(1);
overloadResource.setLoadPlans([overloadStartEvent, overloadEndEvent]);
overloadResource.setChanged(true);
const overloadProblems = overloadResource.getProblems();
assert.equal(overloadProblems.length, 1);
assert.equal(overloadProblems[0] instanceof ProblemCapacityOverload, true);
assert.deepEqual([
  overloadProblems[0].getStart().toString(), overloadProblems[0].getEnd().toString(),
  overloadProblems[0].getQuantity(),
], ["2026-08-20T08:00:00", "2026-08-20T16:00:00", 3]);

const bucketProblemResource = new ResourceBuckets("problem-bucket-resource");
const bucketProblemCalendar = new CalendarDefault("problem-bucket-calendar");
bucketProblemCalendar.setDefault(0);
bucketProblemCalendar.setValue("2026-08-20T00:00:00", "2026-08-21T00:00:00", 8);
bucketProblemResource.setMaximumCalendar(bucketProblemCalendar);
const bucketOverloadEvent = new HeaderModelAdapter();
bucketOverloadEvent.setDate(new PlanningDate("2026-08-20T12:00:00"));
bucketOverloadEvent.setEventType(1);
bucketOverloadEvent.setOnhand(-3);
bucketProblemResource.setLoadPlans([bucketOverloadEvent]);
bucketProblemResource.setChanged(true);
const bucketProblems = bucketProblemResource.getProblems();
assert.equal(bucketProblems.length, 1);
assert.equal(bucketProblems[0] instanceof ProblemCapacityOverload, true);
assert.deepEqual([
  bucketProblems[0].getStart().toString(), bucketProblems[0].getEnd().toString(),
  bucketProblems[0].getQuantity(),
], ["2026-08-20T00:00:00", "2026-08-21T00:00:00", 3]);

const precedenceSourceOperation = new Operation("problem-precedence-source");
const precedenceTargetOperation = new Operation("problem-precedence-target");
const precedenceRule = new OperationDependency(precedenceTargetOperation, precedenceSourceOperation, 1);
precedenceRule.setHardSafetyLeadtime("PT12H");
const precedenceSourcePlan = new OperationPlan(precedenceSourceOperation);
precedenceSourcePlan.setStartEndAndQuantity("2026-08-20T00:00:00", "2026-08-23T00:00:00", 1);
const precedenceTargetPlan = new OperationPlan(precedenceTargetOperation);
precedenceTargetPlan.setStartEndAndQuantity("2026-08-22T00:00:00", "2026-08-24T00:00:00", 1);
new OperationPlanDependency(precedenceSourcePlan, precedenceTargetPlan, precedenceRule);
precedenceTargetPlan.setChanged(true);
assert.equal([...precedenceTargetPlan.getProblems(false)].some((problem) => problem instanceof ProblemPrecedence), true);
assert.equal(precedenceTargetPlan.updateFeasible(), false);
precedenceTargetPlan.setStartEndAndQuantity("2026-08-24T00:00:00", "2026-08-25T00:00:00", 1);
precedenceTargetPlan.setChanged(true);
assert.equal([...precedenceTargetPlan.getProblems(false)].some((problem) => problem instanceof ProblemPrecedence), false);
assert.equal(precedenceTargetPlan.updateFeasible(), true);

const invalidProblem = new ProblemInvalidData(shortageBuffer, "fixture invalid data", "material",
  new PlanningDate("2026-08-01T00:00:00"), new PlanningDate("2026-08-02T00:00:00"));
shortageBuffer.setChanged(true);
assert.equal(shortageBuffer.getProblems().includes(invalidProblem), true);
assert.equal(Problem.all().includes(invalidProblem), true);
shortageBuffer.setDetectProblems(false);
assert.deepEqual(shortageBuffer.getProblems(), []);
shortageBuffer.setChanged(true);
assert.deepEqual(shortageBuffer.getProblems(), []);
shortageBuffer.setDetectProblems(true);
assert.equal(shortageBuffer.getChanged(), true);
assert.equal(shortageBuffer.getProblems().some((problem) => problem instanceof ProblemMaterialShortage), true);

const fenceOperation = new Operation("problem-fence-operation");
fenceOperation.setFence("P2D");
const fencePlan = new OperationPlan(fenceOperation);
fencePlan.setStartEndAndQuantity("2026-08-20T00:00:00", "2026-08-21T00:00:00", 1);
assert.equal(fencePlan.updateFeasible(), false);
fencePlan.setStartEndAndQuantity("2026-08-22T00:00:00", "2026-08-23T00:00:00", 1);
assert.equal(fencePlan.updateFeasible(), true);

const feasibilityCapacityOperation = new Operation("problem-feasibility-capacity-operation");
const feasibilityCapacityResource = new ResourceDefault("problem-feasibility-capacity-resource");
feasibilityCapacityResource.setMaximum(1);
const feasibilityCapacityLoad = new LoadDefault(feasibilityCapacityOperation, feasibilityCapacityResource, 2);
const feasibilityCapacityPlan = new OperationPlan(feasibilityCapacityOperation);
feasibilityCapacityPlan.setStartEndAndQuantity("2026-08-22T08:00:00", "2026-08-22T16:00:00", 1);
new LoadPlan(feasibilityCapacityPlan, feasibilityCapacityLoad);
assert.equal(feasibilityCapacityPlan.updateFeasible(), false);

const feasibilityMaterialOperation = new Operation("problem-feasibility-material-operation");
const feasibilityMaterialLocation = new LocationDefault("problem-feasibility-material-location");
const feasibilityMaterialItem = new ItemMTS("problem-feasibility-material-item");
const feasibilityMaterialBuffer = Buffer.findOrCreate(feasibilityMaterialItem, feasibilityMaterialLocation);
assert.ok(feasibilityMaterialBuffer);
const feasibilityMaterialFlow = new FlowStart(feasibilityMaterialOperation, feasibilityMaterialBuffer, -1);
const feasibilityMaterialPlan = new OperationPlan(feasibilityMaterialOperation);
feasibilityMaterialPlan.setStartEndAndQuantity("2026-08-22T00:00:00", "2026-08-23T00:00:00", 2);
new FlowPlan(feasibilityMaterialPlan, feasibilityMaterialFlow);
assert.equal(feasibilityMaterialPlan.updateFeasible(), false);

for (const value of [precedenceSourcePlan, precedenceTargetPlan, precedenceRule,
  precedenceSourceOperation, precedenceTargetOperation, fencePlan, fenceOperation,
  feasibilityCapacityPlan, feasibilityCapacityLoad, feasibilityCapacityResource,
  feasibilityCapacityOperation, feasibilityMaterialPlan, feasibilityMaterialFlow,
  feasibilityMaterialOperation, feasibilityMaterialBuffer, feasibilityMaterialItem,
  feasibilityMaterialLocation, shortageBuffer, shortageStartEvent, shortageWorstEvent,
  shortageEndEvent, overloadResource, overloadStartEvent, overloadEndEvent,
  bucketProblemResource, bucketProblemCalendar, bucketOverloadEvent]) value.dispose();

const solverDefaults = new SolverCreate();
assert.deepEqual([
  solverDefaults.getConstraints(), solverDefaults.getPlanType(), solverDefaults.getAlgorithm(),
  solverDefaults.getCreateDeliveries(), solverDefaults.getRotateResources(),
  solverDefaults.getAutocommit(), solverDefaults.getLazyDelay().seconds,
], [52, 1, "heuristic", true, true, true, 86_400]);
solverDefaults.setConstraints(SolverCreate.LEADTIME | SolverCreate.CAPACITY);
assert.equal(solverDefaults.getConstraints(), 52);
assert.equal(solverDefaults.isCapacityConstrained(), true);
solverDefaults.setConstraints(0);
assert.equal(solverDefaults.isConstrained(), false);
assert.throws(() => solverDefaults.setPlanType(0), /Invalid plan type/);
assert.throws(() => solverDefaults.setPlanType(4), /Invalid plan type/);
assert.throws(() => solverDefaults.setLazyDelay(0), /Invalid lazy delay/);
assert.throws(() => solverDefaults.setMinimumDelay(-1), /Invalid minimum delay/);
assert.throws(() => solverDefaults.setAdministrativeLeadTime(-1), /positive value/);
assert.throws(() => solverDefaults.setAlgorithm("unknown"), /Invalid algorithm/);
assert.throws(() => solverDefaults.setIterationThreshold(-1), /iteration threshold/);
assert.throws(() => solverDefaults.setIterationAccuracy(101), /iteration accuracy/);

const solverState = new SolverCreateState();
solverState.curBatch = "STATE";
solverState.a_qty = 7;
solverState.a_cost = 11;
solverState.requireFull = true;
const solverData = new SolverCreateSolverData(solverDefaults);
Object.assign(solverData.state, solverState);

// Native createsBatches skips operations loading a constrained resource unless
// enforceBatchWindow is explicitly set on the operation.
const constrainedBatchOperation = new OperationFixedTime("solver-constrained-batch-operation");
constrainedBatchOperation.setDuration(3_600);
constrainedBatchOperation.setBatchWindow(86_400);
const constrainedBatchResource = new ResourceDefault("solver-constrained-batch-resource");
const constrainedBatchLoad = new LoadDefault(constrainedBatchOperation, constrainedBatchResource, 1);
const constrainedBatchBuffer = new Buffer("solver-constrained-batch-buffer");
const constrainedBatchFlow = new FlowEnd(constrainedBatchOperation, constrainedBatchBuffer, 1);
const constrainedBatchFirst = new OperationPlan(constrainedBatchOperation);
constrainedBatchFirst.setStartEndAndQuantity("2026-09-01T08:00:00", "2026-09-01T09:00:00", 3);
constrainedBatchFirst.createFlowLoads();
constrainedBatchFirst.activate();
const constrainedBatchSecond = new OperationPlan(constrainedBatchOperation);
constrainedBatchSecond.setStartEndAndQuantity("2026-09-01T10:00:00", "2026-09-01T11:00:00", 4);
constrainedBatchSecond.createFlowLoads();
constrainedBatchSecond.activate();
solverData.createsBatches(constrainedBatchOperation);
assert.deepEqual([...constrainedBatchOperation.getOperationPlans()].map((value) => value.getQuantity()), [3, 4]);
constrainedBatchOperation.setBoolProperty("enforceBatchWindow", true);
solverData.createsBatches(constrainedBatchOperation);
assert.deepEqual([...constrainedBatchOperation.getOperationPlans()].map((value) => value.getQuantity()), [7]);

const partialState = solverData.push(3, new PlanningDate("2026-09-01T00:00:00"), false);
assert.deepEqual([
  partialState.curBatch, partialState.q_qty, partialState.q_date.toString(), partialState.requireFull,
], ["", 3, "2026-09-01T00:00:00", true]);
partialState.a_qty = 2;
partialState.a_date = new PlanningDate("2026-09-02T00:00:00");
partialState.a_cost = 4;
solverData.pop(true);
assert.deepEqual([
  solverData.state.curBatch, solverData.state.a_qty, solverData.state.a_date.toString(),
  solverData.state.a_cost,
], ["STATE", 2, "2026-09-02T00:00:00", 4]);
const fullState = solverData.push(5, new PlanningDate("2026-09-03T00:00:00"), true);
assert.equal(fullState.curBatch, "STATE");
solverData.pop();
assert.throws(() => solverData.pop(), /State stack empty/);

const flowSolver = new SolverCreate({ constraints: 0, erasePreviousFirst: false });
const flowData = new SolverCreateSolverData(flowSolver);
const flowManager = new CommandManager();
flowData.setCommandManager(flowManager);
const flowOperation = new Operation("solver-flow-operation");
const flowBuffer = new BufferInfinite("solver-flow-infinite-buffer");
const singleFlow = new FlowStart(flowOperation, flowBuffer, -2);
singleFlow.setQuantityFixed(-1);
singleFlow.setEffectiveEnd("2026-09-30T00:00:00");
const flowOperationPlan = new OperationPlan(flowOperation);
flowOperationPlan.setStartEndAndQuantity("2026-09-10T00:00:00", "2026-09-11T00:00:00", 4);
const singleFlowPlan = new FlowPlan(flowOperationPlan, singleFlow);
flowData.state.q_flowplan = singleFlowPlan;
flowData.state.q_qty_min = 3;
const flowAsks = [];
flowSolver.setUserExitBuffer((_buffer, _solver, activeData) => {
  flowAsks.push([activeData.state.q_qty, activeData.state.q_qty_min, activeData.state.q_date.toString()]);
});
flowSolver.solve(singleFlow, flowData);
assert.deepEqual(flowAsks, [[9, 7, "2026-09-10T00:00:00"]]);
assert.deepEqual([flowData.state.a_qty, flowData.state.q_qty_min], [9, 3]);

const datedBuffer = new Buffer("solver-flow-dated-buffer");
const datedFlow = new FlowStart(flowOperation, datedBuffer, -1);
datedFlow.setEffectiveEnd("2026-09-20T00:00:00");
const datedFlowPlan = new FlowPlan(flowOperationPlan, datedFlow);
flowData.state.q_flowplan = datedFlowPlan;
flowData.state.q_qty_min = 2;
flowSolver.solve(datedFlow, flowData);
assert.deepEqual([
  flowData.state.a_qty, flowData.state.a_date.toString(), flowData.state.q_qty_min,
], [4, "2026-09-20T00:00:00", 2]);

const alternateOperation = new Operation("solver-flow-alternate-operation");
const unavailableBuffer = new Buffer("solver-flow-unavailable-buffer");
const partialBuffer = new Buffer("solver-flow-partial-buffer");
partialBuffer.setOnHand(4);
const primaryFlow = new FlowStart(alternateOperation, unavailableBuffer, -1);
primaryFlow.setName("material-choice");
primaryFlow.setPriority(1);
const secondaryFlow = new FlowStart(alternateOperation, partialBuffer, -1);
secondaryFlow.setName("material-choice");
secondaryFlow.setPriority(2);
const alternatePlan = new OperationPlan(alternateOperation);
alternatePlan.setStartEndAndQuantity("2026-09-12T00:00:00", "2026-09-13T00:00:00", 10);
const alternateFlowPlan = new FlowPlan(alternatePlan, primaryFlow);
const alternateData = new SolverCreateSolverData(flowSolver);
alternateData.setCommandManager(flowManager);
alternateData.state.q_flowplan = alternateFlowPlan;
alternateData.state.q_qty_min = 2;
const triedFlows = [];
const rollbackProbe = { value: 0 };
flowSolver.setUserExitFlow((activeFlowPlan, _solver, activeData) => {
  triedFlows.push(activeFlowPlan.getFlow());
  assert.equal(activeFlowPlan, alternateFlowPlan);
  return true;
});
flowSolver.setUserExitBuffer((activeBuffer, _solver, activeData) => {
  if (activeBuffer === unavailableBuffer) {
    activeData.getCommandManager().add(new CommandSetProperty(rollbackProbe, "value", 1));
  }
});
flowSolver.solve(primaryFlow, alternateData);
assert.deepEqual(triedFlows, [primaryFlow]);
assert.deepEqual([
  rollbackProbe.value, alternateFlowPlan.getFlow(), alternateFlowPlan.getQuantity(),
  alternatePlan.getQuantity(), alternateData.state.a_qty, alternateData.state.q_qty_min,
], [1, primaryFlow, -10, 10, 10, 2]);
assert.equal(alternateData.accept_partial_reply, true);
flowSolver.setUserExitBuffer(null);
flowSolver.setUserExitFlow(null);

for (const value of [alternateFlowPlan, alternatePlan, secondaryFlow, primaryFlow,
  partialBuffer, unavailableBuffer, alternateOperation, datedFlowPlan, datedFlow,
  datedBuffer, singleFlowPlan, flowOperationPlan, singleFlow, flowBuffer, flowOperation]) {
  value.dispose();
}

const loadSolver = new SolverCreate({ erasePreviousFirst: false });
loadSolver.setResourceIterationMax(1);
const loadManager = new CommandManager();
const loadData = new SolverCreateSolverData(loadSolver);
loadData.setCommandManager(loadManager);
const alternateLoadOperation = new Operation("solver-load-alternate-operation");
const unavailableLoadResource = new ResourceDefault("solver-load-unavailable-resource");
unavailableLoadResource.setMaximum(0);
unavailableLoadResource.setMaxEarly(0);
const availableLoadResource = new ResourceInfinite("solver-load-available-resource");
const primaryLoad = new LoadDefault(alternateLoadOperation, unavailableLoadResource, 1);
primaryLoad.setName("capacity-choice");
primaryLoad.setPriority(1);
primaryLoad.setSearch("PRIORITY");
const secondaryLoad = new LoadDefault(alternateLoadOperation, availableLoadResource, 1);
secondaryLoad.setName("capacity-choice");
secondaryLoad.setPriority(2);
secondaryLoad.setSearch("PRIORITY");
const alternateLoadPlanOwner = new OperationPlan(alternateLoadOperation);
alternateLoadPlanOwner.setStartEndAndQuantity("2026-09-10T00:00:00", "2026-09-11T00:00:00", 4);
const alternateLoadPlan = new LoadPlan(alternateLoadPlanOwner, primaryLoad);
loadData.state.q_loadplan = alternateLoadPlan;
loadData.state.q_operationplan = alternateLoadPlanOwner;
loadData.state.q_qty = alternateLoadPlan.getQuantity();
loadData.state.q_date = alternateLoadPlan.getDate();
const loadRollbackProbe = { value: 0 };
const priorityLoadTrials = [];
loadSolver.setUserExitResource((resource, _solver, activeData) => {
  priorityLoadTrials.push(resource);
  if (resource === unavailableLoadResource) {
    activeData.getCommandManager().add(new CommandSetProperty(loadRollbackProbe, "value", 1));
  }
});
loadSolver.solve(primaryLoad, loadData);
assert.deepEqual(priorityLoadTrials, [unavailableLoadResource, availableLoadResource]);
assert.deepEqual([
  loadRollbackProbe.value, alternateLoadPlan.getLoad(), alternateLoadPlan.getResource(),
  alternateLoadPlanOwner.getQuantity(), alternateLoadPlanOwner.getStart().toString(),
], [0, secondaryLoad, availableLoadResource, 4, "2026-09-10T00:00:00"]);
assert.ok(loadData.state.a_qty > 0);
loadSolver.setUserExitResource(null);

function evaluateLoadSearch(mode, firstCost, secondCost, firstPenalty, secondPenalty) {
  const solver = new SolverCreate({ constraints: 0, erasePreviousFirst: false });
  const data = new SolverCreateSolverData(solver);
  data.setCommandManager(new CommandManager());
  const operation = new Operation(`solver-load-${mode.toLowerCase()}-operation`);
  const firstResource = new ResourceDefault(`solver-load-${mode.toLowerCase()}-first`);
  const secondResource = new ResourceDefault(`solver-load-${mode.toLowerCase()}-second`);
  firstResource.setCost(firstCost);
  secondResource.setCost(secondCost);
  const firstLoad = new LoadDefault(operation, firstResource, 1);
  firstLoad.setName("search-choice");
  firstLoad.setPriority(1);
  firstLoad.setSearch(mode);
  const secondLoad = new LoadDefault(operation, secondResource, 1);
  secondLoad.setName("search-choice");
  secondLoad.setPriority(2);
  secondLoad.setSearch(mode);
  const operationPlan = new OperationPlan(operation);
  operationPlan.setStartEndAndQuantity("2026-09-10T00:00:00", "2026-09-11T00:00:00", 5);
  const loadPlan = new LoadPlan(operationPlan, firstLoad);
  data.state.q_loadplan = loadPlan;
  data.state.q_operationplan = operationPlan;
  data.state.q_qty = loadPlan.getQuantity();
  data.state.q_date = loadPlan.getDate();
  const entries = [];
  solver.setUserExitResource((resource, _solver, activeData) => {
    entries.push([resource, operationPlan.getStart().toString(), operationPlan.getQuantity()]);
    activeData.state.a_penalty += resource === firstResource ? firstPenalty : secondPenalty;
    if (entries.length === 1) {
      operationPlan.setStartEndAndQuantity("2026-09-20T00:00:00", "2026-09-21T00:00:00", 2);
    }
  });
  solver.solve(firstLoad, data);
  return {
    solver, data, operation, firstResource, secondResource, firstLoad, secondLoad,
    operationPlan, loadPlan, entries,
  };
}

const minimumCostLoad = evaluateLoadSearch("MINCOST", 9, 2, 0, 0);
assert.equal(minimumCostLoad.loadPlan.getLoad(), minimumCostLoad.secondLoad);
assert.equal(minimumCostLoad.loadPlan.getResource(), minimumCostLoad.secondResource);
assert.deepEqual(minimumCostLoad.entries.slice(0, 2).map((entry) => entry.slice(1)), [
  ["2026-09-10T00:00:00", 5], ["2026-09-10T00:00:00", 5],
]);
assert.equal(minimumCostLoad.entries.at(-1)[0], minimumCostLoad.secondResource);
assert.equal(minimumCostLoad.operationPlan.getStart().toString(), "2026-09-10T00:00:00");

const minimumPenaltyLoad = evaluateLoadSearch("MINPENALTY", 1, 10, 8, 2);
assert.equal(minimumPenaltyLoad.loadPlan.getLoad(), minimumPenaltyLoad.secondLoad);
assert.equal(minimumPenaltyLoad.loadPlan.getResource(), minimumPenaltyLoad.secondResource);

const minimumCombinedLoad = evaluateLoadSearch("MINCOSTPENALTY", 1, 3, 8, 1);
assert.equal(minimumCombinedLoad.loadPlan.getLoad(), minimumCombinedLoad.secondLoad);
assert.equal(minimumCombinedLoad.loadPlan.getResource(), minimumCombinedLoad.secondResource);

const groupSolver = new SolverCreate({ constraints: 0, erasePreviousFirst: false });
const groupData = new SolverCreateSolverData(groupSolver);
groupData.setCommandManager(new CommandManager());
const groupOperation = new Operation("solver-load-group-operation");
const resourceGroup = new ResourceDefault("solver-load-resource-group");
const zeroSkillResource = new ResourceDefault("solver-load-zero-skill-resource");
const qualifiedSkillResource = new ResourceDefault("solver-load-qualified-skill-resource");
zeroSkillResource.setOwner(resourceGroup);
qualifiedSkillResource.setOwner(resourceGroup);
const groupSkill = new SkillDefault("solver-load-group-skill");
const zeroResourceSkill = new ResourceSkill(groupSkill, zeroSkillResource, 0);
const qualifiedResourceSkill = new ResourceSkill(groupSkill, qualifiedSkillResource, 2);
const groupLoad = new LoadDefault(groupOperation, resourceGroup, 1);
groupLoad.setSkill(groupSkill);
groupLoad.setSearch("PRIORITY");
const groupOperationPlan = new OperationPlan(groupOperation);
groupOperationPlan.setStartEndAndQuantity("2026-09-10T00:00:00", "2026-09-11T00:00:00", 3);
const groupLoadPlan = new LoadPlan(groupOperationPlan, groupLoad, qualifiedSkillResource);
groupData.state.q_loadplan = groupLoadPlan;
groupData.state.q_operationplan = groupOperationPlan;
groupData.state.q_qty = groupLoadPlan.getQuantity();
groupData.state.q_date = groupLoadPlan.getDate();
const groupTrials = [];
groupSolver.setUserExitResource((resource) => groupTrials.push(resource));
groupSolver.solve(groupLoad, groupData);
assert.deepEqual(groupTrials, [qualifiedSkillResource, qualifiedSkillResource]);
assert.equal(groupLoadPlan.getResource(), qualifiedSkillResource);

const missingSkill = new SkillDefault("solver-load-missing-skill");
const missingSkillLoad = new LoadDefault(groupOperation, resourceGroup, 1);
missingSkillLoad.setSkill(missingSkill);
const missingSkillLoadPlan = new LoadPlan(groupOperationPlan, missingSkillLoad, qualifiedSkillResource);
groupData.state.q_loadplan = missingSkillLoadPlan;
groupData.state.q_operationplan = groupOperationPlan;
groupData.state.q_qty = missingSkillLoadPlan.getQuantity();
groupData.state.q_date = missingSkillLoadPlan.getDate();
assert.throws(() => groupSolver.solve(missingSkillLoad, groupData), /No subresource.*has the skill/);
assert.deepEqual([
  missingSkillLoadPlan.getLoad(), missingSkillLoadPlan.getResource(),
  groupData.constrainedPlanning, groupData.logConstraints,
], [missingSkillLoad, qualifiedSkillResource, true, true]);

const failedDateSolver = new SolverCreate({ erasePreviousFirst: false });
failedDateSolver.setResourceIterationMax(1);
const failedDateData = new SolverCreateSolverData(failedDateSolver);
failedDateData.setCommandManager(new CommandManager());
const failedDateOperation = new Operation("solver-load-failed-date-operation");
const lateFailureResource = new ResourceDefault("solver-load-late-failure-resource");
const earlyFailureResource = new ResourceDefault("solver-load-early-failure-resource");
for (const resource of [lateFailureResource, earlyFailureResource]) {
  resource.setMaximum(0);
  resource.setMaxEarly(0);
}
const lateFailureLoad = new LoadDefault(failedDateOperation, lateFailureResource, 1);
lateFailureLoad.setName("failure-choice");
lateFailureLoad.setPriority(1);
const earlyFailureLoad = new LoadDefault(failedDateOperation, earlyFailureResource, 1);
earlyFailureLoad.setName("failure-choice");
earlyFailureLoad.setPriority(2);
const failedDatePlan = new OperationPlan(failedDateOperation);
failedDatePlan.setStartEndAndQuantity("2026-09-10T00:00:00", "2026-09-11T00:00:00", 2);
const failedDateLoadPlan = new LoadPlan(failedDatePlan, lateFailureLoad);
failedDateData.state.q_loadplan = failedDateLoadPlan;
failedDateData.state.q_operationplan = failedDatePlan;
failedDateData.state.q_qty = failedDateLoadPlan.getQuantity();
failedDateData.state.q_date = failedDateLoadPlan.getDate();
const failedDateEntries = [];
failedDateSolver.setUserExitResource((resource) => {
  failedDateEntries.push([resource, failedDatePlan.getStart().toString(), failedDatePlan.getQuantity()]);
  if (resource === lateFailureResource) {
    failedDatePlan.setStartEndAndQuantity("2026-09-19T00:00:00", "2026-09-20T00:00:00", 2);
  } else {
    failedDatePlan.setStartEndAndQuantity("2026-09-14T00:00:00", "2026-09-15T00:00:00", 2);
  }
});
failedDateSolver.solve(lateFailureLoad, failedDateData);
assert.deepEqual(failedDateEntries.map((entry) => entry.slice(1)), [
  ["2026-09-10T00:00:00", 2], ["2026-09-10T00:00:00", 2],
]);
assert.deepEqual([
  failedDateData.state.a_qty, failedDateData.state.a_date.toString(),
  failedDatePlan.getStart().toString(), failedDatePlan.getQuantity(),
], [0, "2030-12-31T00:00:00", "2026-09-10T00:00:00", 2]);

for (const fixture of [minimumCostLoad, minimumPenaltyLoad, minimumCombinedLoad]) {
  fixture.solver.setUserExitResource(null);
  for (const value of [fixture.loadPlan, fixture.operationPlan, fixture.secondLoad,
    fixture.firstLoad, fixture.secondResource, fixture.firstResource, fixture.operation]) value.dispose();
}
for (const value of [failedDateLoadPlan, failedDatePlan, earlyFailureLoad, lateFailureLoad,
  earlyFailureResource, lateFailureResource, failedDateOperation, missingSkillLoadPlan,
  missingSkillLoad, missingSkill, groupLoadPlan, groupOperationPlan, groupLoad,
  qualifiedResourceSkill, zeroResourceSkill, groupSkill, qualifiedSkillResource,
  zeroSkillResource, resourceGroup, groupOperation, alternateLoadPlan,
  alternateLoadPlanOwner, secondaryLoad, primaryLoad, availableLoadResource,
  unavailableLoadResource, alternateLoadOperation]) value.dispose();
groupSolver.setUserExitResource(null);
failedDateSolver.setUserExitResource(null);

const sortedOperation = new OperationFixedTime("solver-sorted-operation");
sortedOperation.setDuration("P1D");
const sortedDemands = [
  new DemandDefault("solver-demand-late"),
  new DemandDefault("solver-demand-priority"),
  new DemandDefault("solver-demand-small"),
];
for (const demand of sortedDemands) {
  demand.setOperation(sortedOperation);
  demand.setQuantity(10);
  demand.setDue("2026-09-10T00:00:00");
  demand.setPriority(2);
}
sortedDemands[0].setDue("2026-09-12T00:00:00");
sortedDemands[1].setPriority(1);
sortedDemands[2].setQuantity(5);
assert.deepEqual([...sortedDemands].sort(SolverCreate.compareDemands).map((value) => value.getName()), [
  "solver-demand-priority", "solver-demand-small", "solver-demand-late",
]);

const solverCalls = [];
solverDefaults.setConstraints(0);
solverDefaults.setErasePreviousFirst(false);
solverDefaults.setUserExitDemand((demand) => solverCalls.push(`demand:${demand.getName()}`));
solverDefaults.setUserExitOperation((operation) => solverCalls.push(`operation:${operation.getName()}`));
solverDefaults.setUserExitNextDemand((demands) => demands.at(-1) ?? null);
const firstSolvedPlan = solverDefaults.solve(sortedDemands[0]);
assert.ok(firstSolvedPlan instanceof OperationPlan);
assert.deepEqual([
  firstSolvedPlan.getDemand(), firstSolvedPlan.getOperation(), firstSolvedPlan.getQuantity(),
  firstSolvedPlan.getEnd().toString(),
], [sortedDemands[0], sortedOperation, 10, "2026-09-12T00:00:00"]);
assert.deepEqual(solverCalls, ["demand:solver-demand-late", "operation:solver-sorted-operation"]);

const transactionDemand = new DemandDefault("solver-transaction-demand");
transactionDemand.setOperation(sortedOperation);
transactionDemand.setQuantity(4);
transactionDemand.setDue("2026-09-20T00:00:00");
const transactionSolver = new SolverCreate({ autocommit: false, constraints: 0, erasePreviousFirst: false });
const transactionPlan = transactionSolver.solve(transactionDemand);
assert.ok(transactionPlan instanceof OperationPlan);
assert.equal(transactionDemand.getPlannedQuantity(), 4);
transactionSolver.rollback();
assert.equal(transactionDemand.getPlannedQuantity(), 0);
const committedPlan = transactionSolver.solve(transactionDemand);
assert.ok(committedPlan instanceof OperationPlan);
transactionSolver.commit();
assert.equal(transactionDemand.getPlannedQuantity(), 4);

const statusParent = new OperationPlan(sortedOperation);
statusParent.setStartEndAndQuantity("2026-10-01T00:00:00", "2026-10-02T00:00:00", 1);
const statusChild = new OperationPlan(sortedOperation);
statusChild.setStartEndAndQuantity("2026-10-01T00:00:00", "2026-10-02T00:00:00", 1);
statusChild.setOwner(statusParent);
statusParent.setStatus("completed", false);
statusChild.setStatus("approved", false);
new SolverPropagateStatus().solve();
assert.equal(statusChild.getStatus(), "completed");

for (const value of [statusChild, statusParent, committedPlan, transactionDemand, firstSolvedPlan,
  ...sortedDemands, sortedOperation]) value.dispose();

const forwardSourceOperation = new Operation("operator-forward-source");
const forwardTargetOperation = new Operation("operator-forward-target");
const forwardDependency = new OperationDependency(forwardTargetOperation, forwardSourceOperation);
forwardDependency.setHardSafetyLeadtime("P1D");
const forwardSourcePlan = new OperationPlan(forwardSourceOperation);
forwardSourcePlan.setStartEndAndQuantity("2026-08-22T00:00:00", "2026-08-23T00:00:00", 1);
const forwardTargetPlan = new OperationPlan(forwardTargetOperation);
forwardTargetPlan.setStartEndAndQuantity("2026-08-23T00:00:00", "2026-08-24T00:00:00", 1);
new OperationPlanDependency(forwardSourcePlan, forwardTargetPlan, forwardDependency);
const forwardOperator = new OperatorForward();
assert.equal(forwardOperator.solve(forwardSourcePlan, "2026-08-25T00:00:00"), true);
assert.deepEqual([
  forwardSourcePlan.getStart().toString(), forwardSourcePlan.getEnd().toString(),
  forwardTargetPlan.getStart().toString(), forwardTargetPlan.getEnd().toString(),
], [
  "2026-08-25T00:00:00", "2026-08-26T00:00:00",
  "2026-08-27T00:00:00", "2026-08-28T00:00:00",
]);
forwardOperator.rollback();
assert.deepEqual([
  forwardSourcePlan.getStart().toString(), forwardSourcePlan.getEnd().toString(),
  forwardTargetPlan.getStart().toString(), forwardTargetPlan.getEnd().toString(),
], [
  "2026-08-22T00:00:00", "2026-08-23T00:00:00",
  "2026-08-23T00:00:00", "2026-08-24T00:00:00",
]);

const fencedOperation = new Operation("operator-forward-fenced");
fencedOperation.setFence("P2D");
const fencedPlan = new OperationPlan(fencedOperation);
fencedPlan.setStartEndAndQuantity("2026-08-19T00:00:00", "2026-08-20T00:00:00", 1);
const fenceOperator = new OperatorForward();
assert.equal(fenceOperator.solve(fencedPlan, "2026-08-19T00:00:00"), true);
assert.deepEqual([fencedPlan.getStart().toString(), fencedPlan.getEnd().toString()], [
  "2026-08-21T00:00:00", "2026-08-22T00:00:00",
]);
fenceOperator.rollback();
assert.equal(fencedPlan.getStart().toString(), "2026-08-19T00:00:00");

const backwardOperation = new Operation("operator-backward");
const backwardPlan = new OperationPlan(backwardOperation);
backwardPlan.setStartEndAndQuantity("2026-08-25T00:00:00", "2026-08-26T00:00:00", 1);
const backwardOperator = new OperatorBackward();
assert.equal(backwardOperator.solve(backwardPlan, "2026-08-22T00:00:00"), true);
assert.deepEqual([backwardPlan.getStart().toString(), backwardPlan.getEnd().toString()], [
  "2026-08-21T00:00:00", "2026-08-22T00:00:00",
]);
assert.equal(backwardOperator.solve(backwardPlan, "2026-08-21T00:00:00"), false);
backwardOperator.setAcceptTabuCandidate(true);
assert.equal(backwardOperator.solve(backwardPlan, "2026-08-21T00:00:00"), true);
backwardOperator.rollback();
assert.deepEqual([backwardPlan.getStart().toString(), backwardPlan.getEnd().toString()], [
  "2026-08-25T00:00:00", "2026-08-26T00:00:00",
]);

const hardPostRouting = new OperationRouting("operator-hard-posttime-routing");
const hardPostFirstOperation = new Operation("operator-hard-posttime-first");
const hardPostSecondOperation = new Operation("operator-hard-posttime-second");
hardPostFirstOperation.setPostTime("P2D");
assert.equal(hardPostRouting.getHardPostTime(), false);
hardPostRouting.setHardPostTime(true);
assert.equal(hardPostRouting.getHardPostTime(), true);
const hardPostOwner = new OperationPlan(hardPostRouting);
hardPostOwner.setStartEndAndQuantity("2026-08-22T00:00:00", "2026-08-31T00:00:00", 1);
const hardPostFirst = new OperationPlan(hardPostFirstOperation);
hardPostFirst.setStartEndAndQuantity("2026-08-22T00:00:00", "2026-08-23T00:00:00", 1);
hardPostFirst.setOwner(hardPostOwner, false);
const hardPostSecond = new OperationPlan(hardPostSecondOperation);
hardPostSecond.setStartEndAndQuantity("2026-08-23T00:00:00", "2026-08-24T00:00:00", 1);
hardPostSecond.setOwner(hardPostOwner, false);
assert.deepEqual([...hardPostOwner.getSubOperationPlans()], [hardPostFirst, hardPostSecond]);
const hardPostForward = new OperatorForward();
assert.equal(hardPostForward.solve(hardPostFirst, "2026-08-25T00:00:00"), true);
assert.deepEqual([
  hardPostFirst.getEnd().toString(), hardPostSecond.getStart().toString(),
], ["2026-08-26T00:00:00", "2026-08-28T00:00:00"]);
hardPostForward.rollback();
assert.deepEqual([
  hardPostFirst.getEnd().toString(), hardPostSecond.getStart().toString(),
], ["2026-08-23T00:00:00", "2026-08-23T00:00:00"]);

hardPostFirst.setStartEndAndQuantity("2026-08-29T00:00:00", "2026-08-30T00:00:00", 1);
hardPostSecond.setStartEndAndQuantity("2026-08-30T00:00:00", "2026-08-31T00:00:00", 1);
const hardPostBackward = new OperatorBackward();
assert.equal(hardPostBackward.solve(hardPostSecond, "2026-08-29T00:00:00"), true);
assert.deepEqual([
  hardPostFirst.getEnd().toString(), hardPostSecond.getStart().toString(),
], ["2026-08-26T00:00:00", "2026-08-28T00:00:00"]);
hardPostBackward.rollback();

const approvedOperation = new Operation("operator-approved-candidate");
const approvedPlan = new OperationPlan(approvedOperation);
approvedPlan.setStartEndAndQuantity("2026-08-22T00:00:00", "2026-08-23T00:00:00", 1);
approvedPlan.setApproved(true);
const approvedForward = new OperatorForward();
assert.equal(approvedForward.solve(approvedPlan, "2026-08-25T00:00:00"), true);
approvedForward.rollback();
const approvedBackward = new OperatorBackward();
assert.equal(approvedBackward.solve(approvedPlan, "2026-08-22T00:00:00"), true);
approvedBackward.rollback();
assert.equal(approvedPlan.getStatus(), "approved");

const infiniteCandidate = new OperationPlan(approvedOperation);
infiniteCandidate.setStartEndAndQuantity(
  "2026-08-22T00:00:00", PlanningDate.infiniteFuture, 1,
);
assert.equal(new OperatorForward().solve(infiniteCandidate, "2026-08-25T00:00:00"), false);
assert.equal(new OperatorBackward().solve(infiniteCandidate, "2026-08-25T00:00:00"), false);

const previousAutoFence = plan.getAutoFence();
const temporaryShortageBuffer = new Buffer("solver-autofence-buffer");
const temporaryShortageProducer = new OperationFixedTime("solver-autofence-producer");
temporaryShortageProducer.setDuration("P1D");
temporaryShortageBuffer.setProducingOperation(temporaryShortageProducer);
const temporaryShortageConsumer = new OperationFixedTime("solver-autofence-consumer");
temporaryShortageConsumer.setDuration("P1D");
const temporaryShortageSupply = new OperationFixedTime("solver-autofence-supply");
temporaryShortageSupply.setDuration("P1D");
new FlowStart(temporaryShortageConsumer, temporaryShortageBuffer, -1);
new FlowEnd(temporaryShortageSupply, temporaryShortageBuffer, 1);
const temporaryShortageConsumption = new OperationPlan(temporaryShortageConsumer);
temporaryShortageConsumption.setStartEndAndQuantity("2026-08-21T00:00:00", "2026-08-22T00:00:00", 5);
temporaryShortageConsumption.setConfirmed(true);
temporaryShortageConsumption.activate();
const temporaryShortageRecovery = new OperationPlan(temporaryShortageSupply);
temporaryShortageRecovery.setStartEndAndQuantity("2026-08-21T00:00:00", "2026-08-22T00:00:00", 5);
temporaryShortageRecovery.setConfirmed(true);
temporaryShortageRecovery.activate();
plan.setAutoFence("P3D");
const autofenceSolver = new SolverCreate({
  constraints: 0, createDeliveries: false, erasePreviousFirst: false,
});
const autofenceData = new SolverCreateSolverData(autofenceSolver, -1, []);
autofenceData.setCommandManager(new CommandManager());
for (let run = 0; run < 2; run += 1) {
  autofenceData.commit();
  assert.equal(OperationPlan.all().some((candidate) =>
    candidate.getOperation()?.getName() === "Correction for solver-autofence-buffer"), false);
  assert.equal(temporaryShortageBuffer.getFlowPlans().some((candidate) =>
    candidate instanceof FlowPlan
      && candidate.getOperationPlan()?.getOperation()?.getName() === "Correction for solver-autofence-buffer"), false);
}
plan.setAutoFence(previousAutoFence);

const deleteOperation = new Operation("operator-delete");
const deletablePlan = new OperationPlan(deleteOperation);
deletablePlan.setStartEndAndQuantity("2026-08-25T00:00:00", "2026-08-26T00:00:00", 1);
const lockedPlan = new OperationPlan(deleteOperation);
lockedPlan.setStartEndAndQuantity("2026-08-27T00:00:00", "2026-08-28T00:00:00", 1);
lockedPlan.setConfirmed(true);
const deleteManager = new CommandManager();
const deleteOperator = new OperatorDelete({ commandManager: deleteManager });
assert.equal(deleteOperator.solve(lockedPlan), 0);
assert.equal([...deleteOperation.getOperationPlans()].includes(lockedPlan), true);
assert.equal(deleteOperator.solve(deletablePlan), 1);
assert.equal([...deleteOperation.getOperationPlans()].includes(deletablePlan), false);
deleteManager.rollback();
assert.equal([...deleteOperation.getOperationPlans()].includes(deletablePlan), true);

for (const value of [deletablePlan, lockedPlan, deleteOperation, temporaryShortageRecovery,
  temporaryShortageConsumption, temporaryShortageSupply, temporaryShortageConsumer,
  temporaryShortageProducer, temporaryShortageBuffer, infiniteCandidate, approvedPlan,
  approvedOperation, hardPostSecond, hardPostFirst, hardPostOwner, hardPostSecondOperation,
  hardPostFirstOperation, hardPostRouting, backwardPlan, backwardOperation,
  fencedPlan, fencedOperation, forwardSourcePlan, forwardTargetPlan, forwardDependency,
  forwardSourceOperation, forwardTargetOperation]) value.dispose();

const previousCurrent = plan.getCurrent();
const previousForecastCurrent = plan.getFcstCurrent();
plan.setCurrent("2026-01-12T00:00:00");
plan.setFcstCurrent("2026-01-10T00:00:00");
const forecastRanges = Array.from({ length: 14 }, (_value, index) => new DateRange(
  new PlanningDate("2026-01-01T00:00:00").add(new Duration(index * 86_400)),
  new PlanningDate("2026-01-01T00:00:00").add(new Duration((index + 1) * 86_400)),
));
const forecastItem = new ItemMTS("forecast-solver-item");
const forecastLocation = new LocationDefault("forecast-solver-location");
const forecastCustomer = new CustomerDefault("forecast-solver-customer");
const baselineForecast = new Forecast();
baselineForecast.setName("forecast-solver-baseline");
baselineForecast.setItem(forecastItem);
baselineForecast.setLocation(forecastLocation);
baselineForecast.setCustomer(forecastCustomer);
baselineForecast.setMethods(Forecast.METHOD_MOVINGAVERAGE);
const baselineBuckets = baselineForecast.getData(forecastRanges).getBuckets();
for (const bucket of baselineBuckets.slice(0, 9)) Measures.orderstotal.update(bucket, 10);
const forecastSolver = new ForecastSolver();
forecastSolver.computeBaselineForecast(baselineForecast);
assert.equal(baselineForecast.getMethod(), "moving average");
assert.deepEqual(baselineBuckets.slice(11).map((bucket) => bucket.getValue(Measures.forecastbaseline)), [10, 10, 10]);

const outlierBucket = baselineBuckets[2];
assert.ok(outlierBucket);
Measures.outlier.update(outlierBucket, 1);
const outlierDemand = outlierBucket.getOrCreateForecastBucket();
new ProblemOutlier(outlierDemand, new ForecastSolverManual());
assert.equal(outlierDemand.getProblems().some((problem) => problem instanceof ProblemOutlier), true);
baselineForecast.setMethods(Forecast.METHOD_MANUAL);
forecastSolver.computeBaselineForecast(baselineForecast);
assert.deepEqual(baselineBuckets.slice(11).map((bucket) => bucket.getValue(Measures.forecastbaseline)), [0, 0, 0]);
assert.equal(outlierBucket.getValue(Measures.outlier), 0);
assert.equal(outlierDemand.getProblems().some((problem) => problem instanceof ProblemOutlier), false);

for (const bucket of baselineBuckets) {
  Measures.forecastbaseline.update(bucket, bucket.getIndex() + 1);
  Measures.forecastconsumed.update(bucket, 2);
  assert.equal(bucket.getValue(Measures.forecasttotal), bucket.getIndex() + 1);
}
forecastSolver.solve(false, false);
assert.deepEqual(baselineBuckets.slice(8, 12).map((bucket) => [
  bucket.getValue(Measures.forecastconsumed), bucket.getValue(Measures.forecastnet),
]), [[0, 9], [0, 10], [0, 11], [0, 12]]);

const hierarchyItemRoot = new ItemMTS("forecast-match-item-root");
const hierarchyItemChild = new ItemMTS("forecast-match-item-child");
hierarchyItemChild.setOwner(hierarchyItemRoot);
const hierarchyCustomerRoot = new CustomerDefault("forecast-match-customer-root");
const hierarchyCustomerChild = new CustomerDefault("forecast-match-customer-child");
hierarchyCustomerChild.setOwner(hierarchyCustomerRoot);
const hierarchyLocationRoot = new LocationDefault("forecast-match-location-root");
const hierarchyLocationChild = new LocationDefault("forecast-match-location-child");
hierarchyLocationChild.setOwner(hierarchyLocationRoot);
const hierarchyForecast = new Forecast();
hierarchyForecast.setName("forecast-hierarchy-match");
hierarchyForecast.setItem(hierarchyItemRoot);
hierarchyForecast.setCustomer(hierarchyCustomerRoot);
hierarchyForecast.setLocation(hierarchyLocationChild);
const hierarchyDemand = new DemandDefault("forecast-hierarchy-demand");
hierarchyDemand.setItem(hierarchyItemChild);
hierarchyDemand.setCustomer(hierarchyCustomerChild);
hierarchyDemand.setLocation(hierarchyLocationChild);
const matchingDelivery = new Operation("forecast-matching-delivery");
const otherDelivery = new Operation("forecast-other-delivery");
hierarchyForecast.setOperation(matchingDelivery);
hierarchyDemand.setOperation(otherDelivery);
assert.equal(forecastSolver.matchDemandToForecast(hierarchyDemand), null);
forecastSolver.setMatchUsingDeliveryOperation(false);
assert.equal(forecastSolver.matchDemandToForecast(hierarchyDemand), hierarchyForecast);
forecastSolver.setMatchUsingDeliveryOperation(true);
hierarchyDemand.setOperation(matchingDelivery);
assert.equal(forecastSolver.matchDemandToForecast(hierarchyDemand), hierarchyForecast);
hierarchyDemand.setLocation(hierarchyLocationRoot);
hierarchyDemand.setOperation(otherDelivery);
assert.equal(forecastSolver.matchDemandToForecast(hierarchyDemand), null);
forecastSolver.setNetIgnoreLocation(true);
assert.equal(forecastSolver.matchDemandToForecast(hierarchyDemand), hierarchyForecast);
forecastSolver.setNetIgnoreLocation(false);
forecastSolver.setMatchUsingDeliveryOperation(false);

plan.setCurrent("2026-02-01T00:00:00");
plan.setFcstCurrent("2026-02-01T00:00:00");
const netRanges = Array.from({ length: 6 }, (_value, index) => new DateRange(
  new PlanningDate("2026-02-01T00:00:00").add(new Duration(index * 86_400)),
  new PlanningDate("2026-02-01T00:00:00").add(new Duration((index + 1) * 86_400)),
));
const netItem = new ItemMTS("forecast-netting-item");
const netLocation = new LocationDefault("forecast-netting-location");
const netCustomer = new CustomerDefault("forecast-netting-customer");
const netForecast = new Forecast();
netForecast.setName("forecast-netting");
netForecast.setItem(netItem);
netForecast.setLocation(netLocation);
netForecast.setCustomer(netCustomer);
const netBuckets = netForecast.getData(netRanges).getBuckets();
const netDemand = new DemandDefault("forecast-netting-demand");
netDemand.setItem(netItem);
netDemand.setLocation(netLocation);
netDemand.setCustomer(netCustomer);
netDemand.setDue("2026-02-04T12:00:00");
netDemand.setQuantity(12);
forecastSolver.setNetEarly("P3D");
forecastSolver.setNetLate("P3D");
Measures.forecastnet.update(netBuckets[3], 5);
Measures.forecastnet.update(netBuckets[2], 4);
Measures.forecastnet.update(netBuckets[4], 6);
assert.equal(forecastSolver.netDemandFromForecast(netDemand, netForecast), 0);
assert.deepEqual(netBuckets.map((bucket) => [
  bucket.getValue(Measures.forecastconsumed), bucket.getValue(Measures.forecastnet),
]), [[0, 0], [0, 0], [4, 0], [5, 0], [3, 3], [0, 0]]);

for (const bucket of netBuckets) {
  Measures.forecastconsumed.update(bucket, 0);
  Measures.forecastnet.update(bucket, 0);
}
Measures.forecastnet.update(netBuckets[3], 5);
Measures.forecastnet.update(netBuckets[2], 4);
Measures.forecastnet.update(netBuckets[4], 6);
netDemand.setQuantity(20);
netDemand.setDoubleProperty("quantity_to_net", 7);
assert.equal(forecastSolver.netDemandFromForecast(netDemand, netForecast), 0);
assert.deepEqual(netBuckets.slice(2, 5).map((bucket) => bucket.getValue(Measures.forecastconsumed)), [2, 5, 0]);

for (const bucket of netBuckets) {
  Measures.forecastconsumed.update(bucket, 0);
  Measures.forecastnet.update(bucket, 5);
}
netDemand.deleteProperty("quantity_to_net");
netDemand.setQuantity(8);
netDemand.setDoubleProperty("net_early", 0);
netDemand.setDoubleProperty("net_late", 0);
assert.equal(forecastSolver.netDemandFromForecast(netDemand, netForecast), 3);
assert.deepEqual(netBuckets.map((bucket) => bucket.getValue(Measures.forecastconsumed)), [0, 0, 0, 5, 0, 0]);

for (const bucket of netBuckets) {
  Measures.forecastconsumed.update(bucket, 0);
  Measures.forecastnet.update(bucket, bucket === netBuckets[3] ? 9 : 0);
}
netDemand.deleteProperty("net_early");
netDemand.deleteProperty("net_late");
netDemand.setQuantity(6);
forecastSolver.setAutocommit(false);
forecastSolver.solve(netDemand);
assert.deepEqual([
  netBuckets[3].getValue(Measures.forecastconsumed), netBuckets[3].getValue(Measures.forecastnet),
], [6, 3]);
forecastSolver.rollback();
assert.deepEqual([
  netBuckets[3].getValue(Measures.forecastconsumed), netBuckets[3].getValue(Measures.forecastnet),
], [0, 9]);
forecastSolver.solve(netDemand);
forecastSolver.commit();
forecastSolver.rollback();
assert.deepEqual([
  netBuckets[3].getValue(Measures.forecastconsumed), netBuckets[3].getValue(Measures.forecastnet),
], [6, 3]);

baselineForecast.setMethods(Forecast.METHOD_MANUAL);
Measures.forecastbaseline.update(baselineBuckets[11], 27);
plan.setCurrent("2026-01-12T00:00:00");
plan.setFcstCurrent("2026-01-10T00:00:00");
forecastSolver.computeBaselineForecast(baselineForecast);
assert.equal(baselineBuckets[11].getValue(Measures.forecastbaseline), 0);
forecastSolver.rollback();
assert.equal(baselineBuckets[11].getValue(Measures.forecastbaseline), 27);
forecastSolver.setAutocommit(true);

for (const value of [netDemand, netForecast, netCustomer, netLocation, netItem,
  hierarchyDemand, hierarchyForecast, otherDelivery,
  matchingDelivery, hierarchyLocationChild, hierarchyLocationRoot, hierarchyCustomerChild,
  hierarchyCustomerRoot, hierarchyItemChild, hierarchyItemRoot, baselineForecast, forecastCustomer,
  forecastLocation, forecastItem]) value.dispose();
plan.setCurrent(previousCurrent);
plan.setFcstCurrent(previousForecastCurrent);

console.log("Semantic differential fixtures passed.");
