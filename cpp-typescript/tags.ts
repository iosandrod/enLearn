// <header-api-generated>
export const TagsCppModel = { bases: [] as const, methods: [] as const, qualifiedNames: ["Tags"] as const };
// </header-api-generated>

























/**
 * Semantic migration unit for src/tags.cpp.
 * Generated once as a structural baseline and then maintained as TypeScript.
 */

export type PortScalar = string | number | boolean | bigint | null;
export type PortValue = PortScalar | object | readonly PortValue[];

export interface PortDefinition {
  readonly name: string;
  readonly sourceLine: number;
  readonly status: "adapted" | "ported";
}

export const PORT_MANIFEST = [
  { name: "Tags::action", sourceLine: 31, status: "adapted" },
  { name: "Tags::algorithm", sourceLine: 32, status: "adapted" },
  { name: "Tags::allmembers", sourceLine: 33, status: "adapted" },
  { name: "Tags::allowMergingOperationPlans", sourceLine: 34, status: "adapted" },
  { name: "Tags::alternate", sourceLine: 35, status: "adapted" },
  { name: "Tags::alternates", sourceLine: 36, status: "adapted" },
  { name: "Tags::alternate_name", sourceLine: 37, status: "adapted" },
  { name: "Tags::approved", sourceLine: 38, status: "adapted" },
  { name: "Tags::autocommit", sourceLine: 39, status: "adapted" },
  { name: "Tags::autofence", sourceLine: 40, status: "adapted" },
  { name: "Tags::available", sourceLine: 41, status: "adapted" },
  { name: "Tags::batch", sourceLine: 42, status: "adapted" },
  { name: "Tags::batchwindow", sourceLine: 43, status: "adapted" },
  { name: "Tags::blockedby", sourceLine: 44, status: "adapted" },
  { name: "Tags::blocking", sourceLine: 45, status: "adapted" },
  { name: "Tags::booleanproperty", sourceLine: 46, status: "adapted" },
  { name: "Tags::bucket", sourceLine: 47, status: "adapted" },
  { name: "Tags::buckets", sourceLine: 48, status: "adapted" },
  { name: "Tags::buffer", sourceLine: 49, status: "adapted" },
  { name: "Tags::buffers", sourceLine: 50, status: "adapted" },
  { name: "Tags::calendar", sourceLine: 51, status: "adapted" },
  { name: "Tags::calendars", sourceLine: 52, status: "adapted" },
  { name: "Tags::calendars_reorderpoints", sourceLine: 53, status: "adapted" },
  { name: "Tags::category", sourceLine: 54, status: "adapted" },
  { name: "Tags::closed", sourceLine: 55, status: "adapted" },
  { name: "Tags::cluster", sourceLine: 56, status: "adapted" },
  { name: "Tags::completed", sourceLine: 57, status: "adapted" },
  { name: "Tags::completed_allow_future", sourceLine: 58, status: "adapted" },
  { name: "Tags::confirmed", sourceLine: 59, status: "adapted" },
  { name: "Tags::constraints", sourceLine: 60, status: "adapted" },
  { name: "Tags::constrained", sourceLine: 61, status: "adapted" },
  { name: "Tags::consume_material", sourceLine: 62, status: "adapted" },
  { name: "Tags::consume_capacity", sourceLine: 63, status: "adapted" },
  { name: "Tags::consuming", sourceLine: 64, status: "adapted" },
  { name: "Tags::consuming_date", sourceLine: 65, status: "adapted" },
  { name: "Tags::content", sourceLine: 66, status: "adapted" },
  { name: "Tags::cost", sourceLine: 67, status: "adapted" },
  { name: "Tags::criticality", sourceLine: 68, status: "adapted" },
  { name: "Tags::create", sourceLine: 69, status: "adapted" },
  { name: "Tags::current", sourceLine: 70, status: "adapted" },
  { name: "Tags::customer", sourceLine: 71, status: "adapted" },
  { name: "Tags::customers", sourceLine: 72, status: "adapted" },
  { name: "Tags::data", sourceLine: 73, status: "adapted" },
  { name: "Tags::date", sourceLine: 74, status: "adapted" },
  { name: "Tags::dateproperty", sourceLine: 75, status: "adapted" },
  { name: "Tags::dates", sourceLine: 76, status: "adapted" },
  { name: "Tags::days", sourceLine: 77, status: "adapted" },
  { name: "Tags::dbconnection", sourceLine: 78, status: "adapted" },
  { name: "Tags::deflt", sourceLine: 79, status: "adapted" },
  { name: "Tags::delay", sourceLine: 80, status: "adapted" },
  { name: "Tags::delivery", sourceLine: 81, status: "adapted" },
  { name: "Tags::delivery_operation", sourceLine: 82, status: "adapted" },
  { name: "Tags::deliveryduration", sourceLine: 83, status: "adapted" },
  { name: "Tags::demand", sourceLine: 84, status: "adapted" },
  { name: "Tags::demands", sourceLine: 85, status: "adapted" },
  { name: "Tags::demand_deviation", sourceLine: 86, status: "adapted" },
  { name: "Tags::dependencies", sourceLine: 87, status: "adapted" },
  { name: "Tags::dependency", sourceLine: 88, status: "adapted" },
  { name: "Tags::description", sourceLine: 89, status: "adapted" },
  { name: "Tags::destination", sourceLine: 90, status: "adapted" },
  { name: "Tags::detectproblems", sourceLine: 91, status: "adapted" },
  { name: "Tags::discrete", sourceLine: 92, status: "adapted" },
  { name: "Tags::doubleproperty", sourceLine: 93, status: "adapted" },
  { name: "Tags::due", sourceLine: 94, status: "adapted" },
  { name: "Tags::duration", sourceLine: 95, status: "adapted" },
  { name: "Tags::duration_per", sourceLine: 96, status: "adapted" },
  { name: "Tags::efficiency", sourceLine: 97, status: "adapted" },
  { name: "Tags::efficiency_calendar", sourceLine: 98, status: "adapted" },
  { name: "Tags::effective_start", sourceLine: 99, status: "adapted" },
  { name: "Tags::effective_end", sourceLine: 100, status: "adapted" },
  { name: "Tags::end", sourceLine: 101, status: "adapted" },
  { name: "Tags::end_force", sourceLine: 102, status: "adapted" },
  { name: "Tags::enddate", sourceLine: 103, status: "adapted" },
  { name: "Tags::endtime", sourceLine: 104, status: "adapted" },
  { name: "Tags::entity", sourceLine: 105, status: "adapted" },
  { name: "Tags::erase", sourceLine: 106, status: "adapted" },
  { name: "Tags::extra_safety_leadtime", sourceLine: 107, status: "adapted" },
  { name: "Tags::factor", sourceLine: 108, status: "adapted" },
  { name: "Tags::fcst_current", sourceLine: 109, status: "adapted" },
  { name: "Tags::feasible", sourceLine: 110, status: "adapted" },
  { name: "Tags::fence", sourceLine: 111, status: "adapted" },
  { name: "Tags::filename", sourceLine: 112, status: "adapted" },
  { name: "Tags::first", sourceLine: 113, status: "adapted" },
  { name: "Tags::flow", sourceLine: 114, status: "adapted" },
  { name: "Tags::flowplan", sourceLine: 115, status: "adapted" },
  { name: "Tags::flowplans", sourceLine: 116, status: "adapted" },
  { name: "Tags::flows", sourceLine: 117, status: "adapted" },
  { name: "Tags::fromsetup", sourceLine: 118, status: "adapted" },
  { name: "Tags::hard_safety_leadtime", sourceLine: 119, status: "adapted" },
  { name: "Tags::hard_posttime", sourceLine: 120, status: "adapted" },
  { name: "Tags::headeratts", sourceLine: 121, status: "adapted" },
  { name: "Tags::headerstart", sourceLine: 122, status: "adapted" },
  { name: "Tags::hidden", sourceLine: 123, status: "adapted" },
  { name: "Tags::id", sourceLine: 124, status: "adapted" },
  { name: "Tags::individualPoolResources", sourceLine: 125, status: "adapted" },
  { name: "Tags::info", sourceLine: 126, status: "adapted" },
  { name: "Tags::interruption", sourceLine: 127, status: "adapted" },
  { name: "Tags::interruptions", sourceLine: 128, status: "adapted" },
  { name: "Tags::ip_flag", sourceLine: 129, status: "adapted" },
  { name: "Tags::item", sourceLine: 130, status: "adapted" },
  { name: "Tags::itemdistribution", sourceLine: 131, status: "adapted" },
  { name: "Tags::itemdistributions", sourceLine: 132, status: "adapted" },
  { name: "Tags::items", sourceLine: 133, status: "adapted" },
  { name: "Tags::itemsupplier", sourceLine: 134, status: "adapted" },
  { name: "Tags::itemsuppliers", sourceLine: 135, status: "adapted" },
  { name: "Tags::leadtime", sourceLine: 136, status: "adapted" },
  { name: "Tags::level", sourceLine: 137, status: "adapted" },
  { name: "Tags::load", sourceLine: 138, status: "adapted" },
  { name: "Tags::loadplan", sourceLine: 139, status: "adapted" },
  { name: "Tags::loadplans", sourceLine: 140, status: "adapted" },
  { name: "Tags::loads", sourceLine: 141, status: "adapted" },
  { name: "Tags::location", sourceLine: 142, status: "adapted" },
  { name: "Tags::locations", sourceLine: 143, status: "adapted" },
  { name: "Tags::locked", sourceLine: 144, status: "adapted" },
  { name: "Tags::logfile", sourceLine: 145, status: "adapted" },
  { name: "Tags::loglimit", sourceLine: 146, status: "adapted" },
  { name: "Tags::loglevel", sourceLine: 147, status: "adapted" },
  { name: "Tags::manager", sourceLine: 148, status: "adapted" },
  { name: "Tags::maxearly", sourceLine: 149, status: "adapted" },
  { name: "Tags::maximum", sourceLine: 150, status: "adapted" },
  { name: "Tags::maximum_calendar", sourceLine: 151, status: "adapted" },
  { name: "Tags::maxinventory", sourceLine: 152, status: "adapted" },
  { name: "Tags::maxlateness", sourceLine: 153, status: "adapted" },
  { name: "Tags::maxbucketcapacity", sourceLine: 154, status: "adapted" },
  { name: "Tags::members", sourceLine: 155, status: "adapted" },
  { name: "Tags::minimum", sourceLine: 156, status: "adapted" },
  { name: "Tags::minimum_calendar", sourceLine: 157, status: "adapted" },
  { name: "Tags::mininventory", sourceLine: 158, status: "adapted" },
  { name: "Tags::minshipment", sourceLine: 159, status: "adapted" },
  { name: "Tags::moveApprovedEarly", sourceLine: 160, status: "adapted" },
  { name: "Tags::name", sourceLine: 161, status: "adapted" },
  { name: "Tags::nolocationcalendar", sourceLine: 162, status: "adapted" },
  { name: "Tags::offset", sourceLine: 163, status: "adapted" },
  { name: "Tags::onhand", sourceLine: 164, status: "adapted" },
  { name: "Tags::operation", sourceLine: 165, status: "adapted" },
  { name: "Tags::operationplan", sourceLine: 166, status: "adapted" },
  { name: "Tags::operationplans", sourceLine: 167, status: "adapted" },
  { name: "Tags::operations", sourceLine: 168, status: "adapted" },
  { name: "Tags::ordertype", sourceLine: 169, status: "adapted" },
  { name: "Tags::origin", sourceLine: 170, status: "adapted" },
  { name: "Tags::owner", sourceLine: 171, status: "adapted" },
  { name: "Tags::pegging", sourceLine: 172, status: "adapted" },
  { name: "Tags::pegging_first_level", sourceLine: 173, status: "adapted" },
  { name: "Tags::pegging_demand", sourceLine: 174, status: "adapted" },
  { name: "Tags::pegging_downstream", sourceLine: 175, status: "adapted" },
  { name: "Tags::pegging_downstream_first_level", sourceLine: 176, status: "adapted" },
  { name: "Tags::pegging_upstream", sourceLine: 178, status: "adapted" },
  { name: "Tags::pegging_upstream_first_level", sourceLine: 179, status: "adapted" },
  { name: "Tags::percent", sourceLine: 181, status: "adapted" },
  { name: "Tags::period_of_cover", sourceLine: 182, status: "adapted" },
  { name: "Tags::plan", sourceLine: 183, status: "adapted" },
  { name: "Tags::planned", sourceLine: 184, status: "adapted" },
  { name: "Tags::planned_quantity", sourceLine: 185, status: "adapted" },
  { name: "Tags::plantype", sourceLine: 186, status: "adapted" },
  { name: "Tags::policy", sourceLine: 187, status: "adapted" },
  { name: "Tags::posttime", sourceLine: 188, status: "adapted" },
  { name: "Tags::priority", sourceLine: 189, status: "adapted" },
  { name: "Tags::problem", sourceLine: 190, status: "adapted" },
  { name: "Tags::problems", sourceLine: 191, status: "adapted" },
  { name: "Tags::produce_material", sourceLine: 192, status: "adapted" },
  { name: "Tags::producing", sourceLine: 193, status: "adapted" },
  { name: "Tags::property", sourceLine: 194, status: "adapted" },
  { name: "Tags::proposed", sourceLine: 195, status: "adapted" },
  { name: "Tags::quantity", sourceLine: 196, status: "adapted" },
  { name: "Tags::quantity_fixed", sourceLine: 197, status: "adapted" },
  { name: "Tags::quantity_completed", sourceLine: 198, status: "adapted" },
  { name: "Tags::reference", sourceLine: 199, status: "adapted" },
  { name: "Tags::remark", sourceLine: 200, status: "adapted" },
  { name: "Tags::resource", sourceLine: 201, status: "adapted" },
  { name: "Tags::resources", sourceLine: 202, status: "adapted" },
  { name: "Tags::resourceskill", sourceLine: 203, status: "adapted" },
  { name: "Tags::resourceskills", sourceLine: 204, status: "adapted" },
  { name: "Tags::resource_qty", sourceLine: 205, status: "adapted" },
  { name: "Tags::root", sourceLine: 206, status: "adapted" },
  { name: "Tags::rule", sourceLine: 207, status: "adapted" },
  { name: "Tags::rules", sourceLine: 208, status: "adapted" },
  { name: "Tags::safety_leadtime", sourceLine: 209, status: "adapted" },
  { name: "Tags::search", sourceLine: 210, status: "adapted" },
  { name: "Tags::second", sourceLine: 211, status: "adapted" },
  { name: "Tags::setup", sourceLine: 212, status: "adapted" },
  { name: "Tags::setupend", sourceLine: 213, status: "adapted" },
  { name: "Tags::setupmatrices", sourceLine: 214, status: "adapted" },
  { name: "Tags::setupmatrix", sourceLine: 215, status: "adapted" },
  { name: "Tags::setuponly", sourceLine: 216, status: "adapted" },
  { name: "Tags::shortage_tolerance", sourceLine: 217, status: "adapted" },
  { name: "Tags::size_maximum", sourceLine: 218, status: "adapted" },
  { name: "Tags::setupoverride", sourceLine: 219, status: "adapted" },
  { name: "Tags::size_minimum", sourceLine: 220, status: "adapted" },
  { name: "Tags::size_minimum_calendar", sourceLine: 221, status: "adapted" },
  { name: "Tags::size_multiple", sourceLine: 222, status: "adapted" },
  { name: "Tags::skill", sourceLine: 223, status: "adapted" },
  { name: "Tags::skills", sourceLine: 224, status: "adapted" },
  { name: "Tags::solver", sourceLine: 225, status: "adapted" },
  { name: "Tags::solvers", sourceLine: 226, status: "adapted" },
  { name: "Tags::source", sourceLine: 227, status: "adapted" },
  { name: "Tags::start", sourceLine: 228, status: "adapted" },
  { name: "Tags::start_force", sourceLine: 229, status: "adapted" },
  { name: "Tags::startorend", sourceLine: 230, status: "adapted" },
  { name: "Tags::startdate", sourceLine: 231, status: "adapted" },
  { name: "Tags::starttime", sourceLine: 232, status: "adapted" },
  { name: "Tags::status", sourceLine: 233, status: "adapted" },
  { name: "Tags::statusNoPropagation", sourceLine: 234, status: "adapted" },
  { name: "Tags::stringproperty", sourceLine: 235, status: "adapted" },
  { name: "Tags::subcategory", sourceLine: 236, status: "adapted" },
  { name: "Tags::suboperation", sourceLine: 237, status: "adapted" },
  { name: "Tags::suboperations", sourceLine: 238, status: "adapted" },
  { name: "Tags::supplier", sourceLine: 239, status: "adapted" },
  { name: "Tags::suppliers", sourceLine: 240, status: "adapted" },
  { name: "Tags::supply", sourceLine: 241, status: "adapted" },
  { name: "Tags::suppressFlowplanCreation", sourceLine: 242, status: "adapted" },
  { name: "Tags::timezone", sourceLine: 243, status: "adapted" },
  { name: "Tags::tool", sourceLine: 244, status: "adapted" },
  { name: "Tags::toolperpiece", sourceLine: 245, status: "adapted" },
  { name: "Tags::tosetup", sourceLine: 246, status: "adapted" },
  { name: "Tags::transferbatch", sourceLine: 247, status: "adapted" },
  { name: "Tags::type", sourceLine: 251, status: "adapted" },
  { name: "Tags::unavailable", sourceLine: 252, status: "adapted" },
  { name: "Tags::uom", sourceLine: 253, status: "adapted" },
  { name: "Tags::userexit_buffer", sourceLine: 254, status: "adapted" },
  { name: "Tags::userexit_demand", sourceLine: 255, status: "adapted" },
  { name: "Tags::userexit_flow", sourceLine: 256, status: "adapted" },
  { name: "Tags::userexit_nextdemand", sourceLine: 257, status: "adapted" },
  { name: "Tags::userexit_operation", sourceLine: 258, status: "adapted" },
  { name: "Tags::userexit_resource", sourceLine: 259, status: "adapted" },
  { name: "Tags::value", sourceLine: 260, status: "adapted" },
  { name: "Tags::variable", sourceLine: 261, status: "adapted" },
  { name: "Tags::verbose", sourceLine: 262, status: "adapted" },
  { name: "Tags::volume", sourceLine: 263, status: "adapted" },
  { name: "Tags::weight", sourceLine: 264, status: "adapted" },
  { name: "Tags::wip_produce_full_quantity", sourceLine: 265, status: "adapted" },
] as const satisfies readonly PortDefinition[];

export interface TagsPort {
  action(...args: readonly PortValue[]): PortValue | void;
  algorithm(...args: readonly PortValue[]): PortValue | void;
  allmembers(...args: readonly PortValue[]): PortValue | void;
  allowMergingOperationPlans(...args: readonly PortValue[]): PortValue | void;
  alternate(...args: readonly PortValue[]): PortValue | void;
  alternate_name(...args: readonly PortValue[]): PortValue | void;
  alternates(...args: readonly PortValue[]): PortValue | void;
  approved(...args: readonly PortValue[]): PortValue | void;
  autocommit(...args: readonly PortValue[]): PortValue | void;
  autofence(...args: readonly PortValue[]): PortValue | void;
  available(...args: readonly PortValue[]): PortValue | void;
  batch(...args: readonly PortValue[]): PortValue | void;
  batchwindow(...args: readonly PortValue[]): PortValue | void;
  blockedby(...args: readonly PortValue[]): PortValue | void;
  blocking(...args: readonly PortValue[]): PortValue | void;
  booleanproperty(...args: readonly PortValue[]): PortValue | void;
  bucket(...args: readonly PortValue[]): PortValue | void;
  buckets(...args: readonly PortValue[]): PortValue | void;
  buffer(...args: readonly PortValue[]): PortValue | void;
  buffers(...args: readonly PortValue[]): PortValue | void;
  calendar(...args: readonly PortValue[]): PortValue | void;
  calendars(...args: readonly PortValue[]): PortValue | void;
  calendars_reorderpoints(...args: readonly PortValue[]): PortValue | void;
  category(...args: readonly PortValue[]): PortValue | void;
  closed(...args: readonly PortValue[]): PortValue | void;
  cluster(...args: readonly PortValue[]): PortValue | void;
  completed(...args: readonly PortValue[]): PortValue | void;
  completed_allow_future(...args: readonly PortValue[]): PortValue | void;
  confirmed(...args: readonly PortValue[]): PortValue | void;
  constrained(...args: readonly PortValue[]): PortValue | void;
  constraints(...args: readonly PortValue[]): PortValue | void;
  consume_capacity(...args: readonly PortValue[]): PortValue | void;
  consume_material(...args: readonly PortValue[]): PortValue | void;
  consuming(...args: readonly PortValue[]): PortValue | void;
  consuming_date(...args: readonly PortValue[]): PortValue | void;
  content(...args: readonly PortValue[]): PortValue | void;
  cost(...args: readonly PortValue[]): PortValue | void;
  create(...args: readonly PortValue[]): PortValue | void;
  criticality(...args: readonly PortValue[]): PortValue | void;
  current(...args: readonly PortValue[]): PortValue | void;
  customer(...args: readonly PortValue[]): PortValue | void;
  customers(...args: readonly PortValue[]): PortValue | void;
  data(...args: readonly PortValue[]): PortValue | void;
  date(...args: readonly PortValue[]): PortValue | void;
  dateproperty(...args: readonly PortValue[]): PortValue | void;
  dates(...args: readonly PortValue[]): PortValue | void;
  days(...args: readonly PortValue[]): PortValue | void;
  dbconnection(...args: readonly PortValue[]): PortValue | void;
  deflt(...args: readonly PortValue[]): PortValue | void;
  delay(...args: readonly PortValue[]): PortValue | void;
  delivery(...args: readonly PortValue[]): PortValue | void;
  delivery_operation(...args: readonly PortValue[]): PortValue | void;
  deliveryduration(...args: readonly PortValue[]): PortValue | void;
  demand(...args: readonly PortValue[]): PortValue | void;
  demand_deviation(...args: readonly PortValue[]): PortValue | void;
  demands(...args: readonly PortValue[]): PortValue | void;
  dependencies(...args: readonly PortValue[]): PortValue | void;
  dependency(...args: readonly PortValue[]): PortValue | void;
  description(...args: readonly PortValue[]): PortValue | void;
  destination(...args: readonly PortValue[]): PortValue | void;
  detectproblems(...args: readonly PortValue[]): PortValue | void;
  discrete(...args: readonly PortValue[]): PortValue | void;
  doubleproperty(...args: readonly PortValue[]): PortValue | void;
  due(...args: readonly PortValue[]): PortValue | void;
  duration(...args: readonly PortValue[]): PortValue | void;
  duration_per(...args: readonly PortValue[]): PortValue | void;
  effective_end(...args: readonly PortValue[]): PortValue | void;
  effective_start(...args: readonly PortValue[]): PortValue | void;
  efficiency(...args: readonly PortValue[]): PortValue | void;
  efficiency_calendar(...args: readonly PortValue[]): PortValue | void;
  end(...args: readonly PortValue[]): PortValue | void;
  end_force(...args: readonly PortValue[]): PortValue | void;
  enddate(...args: readonly PortValue[]): PortValue | void;
  endtime(...args: readonly PortValue[]): PortValue | void;
  entity(...args: readonly PortValue[]): PortValue | void;
  erase(...args: readonly PortValue[]): PortValue | void;
  extra_safety_leadtime(...args: readonly PortValue[]): PortValue | void;
  factor(...args: readonly PortValue[]): PortValue | void;
  fcst_current(...args: readonly PortValue[]): PortValue | void;
  feasible(...args: readonly PortValue[]): PortValue | void;
  fence(...args: readonly PortValue[]): PortValue | void;
  filename(...args: readonly PortValue[]): PortValue | void;
  first(...args: readonly PortValue[]): PortValue | void;
  flow(...args: readonly PortValue[]): PortValue | void;
  flowplan(...args: readonly PortValue[]): PortValue | void;
  flowplans(...args: readonly PortValue[]): PortValue | void;
  flows(...args: readonly PortValue[]): PortValue | void;
  fromsetup(...args: readonly PortValue[]): PortValue | void;
  hard_posttime(...args: readonly PortValue[]): PortValue | void;
  hard_safety_leadtime(...args: readonly PortValue[]): PortValue | void;
  headeratts(...args: readonly PortValue[]): PortValue | void;
  headerstart(...args: readonly PortValue[]): PortValue | void;
  hidden(...args: readonly PortValue[]): PortValue | void;
  id(...args: readonly PortValue[]): PortValue | void;
  individualPoolResources(...args: readonly PortValue[]): PortValue | void;
  info(...args: readonly PortValue[]): PortValue | void;
  interruption(...args: readonly PortValue[]): PortValue | void;
  interruptions(...args: readonly PortValue[]): PortValue | void;
  ip_flag(...args: readonly PortValue[]): PortValue | void;
  item(...args: readonly PortValue[]): PortValue | void;
  itemdistribution(...args: readonly PortValue[]): PortValue | void;
  itemdistributions(...args: readonly PortValue[]): PortValue | void;
  items(...args: readonly PortValue[]): PortValue | void;
  itemsupplier(...args: readonly PortValue[]): PortValue | void;
  itemsuppliers(...args: readonly PortValue[]): PortValue | void;
  leadtime(...args: readonly PortValue[]): PortValue | void;
  level(...args: readonly PortValue[]): PortValue | void;
  load(...args: readonly PortValue[]): PortValue | void;
  loadplan(...args: readonly PortValue[]): PortValue | void;
  loadplans(...args: readonly PortValue[]): PortValue | void;
  loads(...args: readonly PortValue[]): PortValue | void;
  location(...args: readonly PortValue[]): PortValue | void;
  locations(...args: readonly PortValue[]): PortValue | void;
  locked(...args: readonly PortValue[]): PortValue | void;
  logfile(...args: readonly PortValue[]): PortValue | void;
  loglevel(...args: readonly PortValue[]): PortValue | void;
  loglimit(...args: readonly PortValue[]): PortValue | void;
  manager(...args: readonly PortValue[]): PortValue | void;
  maxbucketcapacity(...args: readonly PortValue[]): PortValue | void;
  maxearly(...args: readonly PortValue[]): PortValue | void;
  maximum(...args: readonly PortValue[]): PortValue | void;
  maximum_calendar(...args: readonly PortValue[]): PortValue | void;
  maxinventory(...args: readonly PortValue[]): PortValue | void;
  maxlateness(...args: readonly PortValue[]): PortValue | void;
  members(...args: readonly PortValue[]): PortValue | void;
  minimum(...args: readonly PortValue[]): PortValue | void;
  minimum_calendar(...args: readonly PortValue[]): PortValue | void;
  mininventory(...args: readonly PortValue[]): PortValue | void;
  minshipment(...args: readonly PortValue[]): PortValue | void;
  moveApprovedEarly(...args: readonly PortValue[]): PortValue | void;
  name(...args: readonly PortValue[]): PortValue | void;
  nolocationcalendar(...args: readonly PortValue[]): PortValue | void;
  offset(...args: readonly PortValue[]): PortValue | void;
  onhand(...args: readonly PortValue[]): PortValue | void;
  operation(...args: readonly PortValue[]): PortValue | void;
  operationplan(...args: readonly PortValue[]): PortValue | void;
  operationplans(...args: readonly PortValue[]): PortValue | void;
  operations(...args: readonly PortValue[]): PortValue | void;
  ordertype(...args: readonly PortValue[]): PortValue | void;
  origin(...args: readonly PortValue[]): PortValue | void;
  owner(...args: readonly PortValue[]): PortValue | void;
  pegging(...args: readonly PortValue[]): PortValue | void;
  pegging_demand(...args: readonly PortValue[]): PortValue | void;
  pegging_downstream(...args: readonly PortValue[]): PortValue | void;
  pegging_downstream_first_level(...args: readonly PortValue[]): PortValue | void;
  pegging_first_level(...args: readonly PortValue[]): PortValue | void;
  pegging_upstream(...args: readonly PortValue[]): PortValue | void;
  pegging_upstream_first_level(...args: readonly PortValue[]): PortValue | void;
  percent(...args: readonly PortValue[]): PortValue | void;
  period_of_cover(...args: readonly PortValue[]): PortValue | void;
  plan(...args: readonly PortValue[]): PortValue | void;
  planned(...args: readonly PortValue[]): PortValue | void;
  planned_quantity(...args: readonly PortValue[]): PortValue | void;
  plantype(...args: readonly PortValue[]): PortValue | void;
  policy(...args: readonly PortValue[]): PortValue | void;
  posttime(...args: readonly PortValue[]): PortValue | void;
  priority(...args: readonly PortValue[]): PortValue | void;
  problem(...args: readonly PortValue[]): PortValue | void;
  problems(...args: readonly PortValue[]): PortValue | void;
  produce_material(...args: readonly PortValue[]): PortValue | void;
  producing(...args: readonly PortValue[]): PortValue | void;
  property(...args: readonly PortValue[]): PortValue | void;
  proposed(...args: readonly PortValue[]): PortValue | void;
  quantity(...args: readonly PortValue[]): PortValue | void;
  quantity_completed(...args: readonly PortValue[]): PortValue | void;
  quantity_fixed(...args: readonly PortValue[]): PortValue | void;
  reference(...args: readonly PortValue[]): PortValue | void;
  remark(...args: readonly PortValue[]): PortValue | void;
  resource(...args: readonly PortValue[]): PortValue | void;
  resource_qty(...args: readonly PortValue[]): PortValue | void;
  resources(...args: readonly PortValue[]): PortValue | void;
  resourceskill(...args: readonly PortValue[]): PortValue | void;
  resourceskills(...args: readonly PortValue[]): PortValue | void;
  root(...args: readonly PortValue[]): PortValue | void;
  rule(...args: readonly PortValue[]): PortValue | void;
  rules(...args: readonly PortValue[]): PortValue | void;
  safety_leadtime(...args: readonly PortValue[]): PortValue | void;
  search(...args: readonly PortValue[]): PortValue | void;
  second(...args: readonly PortValue[]): PortValue | void;
  setup(...args: readonly PortValue[]): PortValue | void;
  setupend(...args: readonly PortValue[]): PortValue | void;
  setupmatrices(...args: readonly PortValue[]): PortValue | void;
  setupmatrix(...args: readonly PortValue[]): PortValue | void;
  setuponly(...args: readonly PortValue[]): PortValue | void;
  setupoverride(...args: readonly PortValue[]): PortValue | void;
  shortage_tolerance(...args: readonly PortValue[]): PortValue | void;
  size_maximum(...args: readonly PortValue[]): PortValue | void;
  size_minimum(...args: readonly PortValue[]): PortValue | void;
  size_minimum_calendar(...args: readonly PortValue[]): PortValue | void;
  size_multiple(...args: readonly PortValue[]): PortValue | void;
  skill(...args: readonly PortValue[]): PortValue | void;
  skills(...args: readonly PortValue[]): PortValue | void;
  solver(...args: readonly PortValue[]): PortValue | void;
  solvers(...args: readonly PortValue[]): PortValue | void;
  source(...args: readonly PortValue[]): PortValue | void;
  start(...args: readonly PortValue[]): PortValue | void;
  start_force(...args: readonly PortValue[]): PortValue | void;
  startdate(...args: readonly PortValue[]): PortValue | void;
  startorend(...args: readonly PortValue[]): PortValue | void;
  starttime(...args: readonly PortValue[]): PortValue | void;
  status(...args: readonly PortValue[]): PortValue | void;
  statusNoPropagation(...args: readonly PortValue[]): PortValue | void;
  stringproperty(...args: readonly PortValue[]): PortValue | void;
  subcategory(...args: readonly PortValue[]): PortValue | void;
  suboperation(...args: readonly PortValue[]): PortValue | void;
  suboperations(...args: readonly PortValue[]): PortValue | void;
  supplier(...args: readonly PortValue[]): PortValue | void;
  suppliers(...args: readonly PortValue[]): PortValue | void;
  supply(...args: readonly PortValue[]): PortValue | void;
  suppressFlowplanCreation(...args: readonly PortValue[]): PortValue | void;
  timezone(...args: readonly PortValue[]): PortValue | void;
  tool(...args: readonly PortValue[]): PortValue | void;
  toolperpiece(...args: readonly PortValue[]): PortValue | void;
  tosetup(...args: readonly PortValue[]): PortValue | void;
  transferbatch(...args: readonly PortValue[]): PortValue | void;
  type(...args: readonly PortValue[]): PortValue | void;
  unavailable(...args: readonly PortValue[]): PortValue | void;
  uom(...args: readonly PortValue[]): PortValue | void;
  userexit_buffer(...args: readonly PortValue[]): PortValue | void;
  userexit_demand(...args: readonly PortValue[]): PortValue | void;
  userexit_flow(...args: readonly PortValue[]): PortValue | void;
  userexit_nextdemand(...args: readonly PortValue[]): PortValue | void;
  userexit_operation(...args: readonly PortValue[]): PortValue | void;
  userexit_resource(...args: readonly PortValue[]): PortValue | void;
  value(...args: readonly PortValue[]): PortValue | void;
  variable(...args: readonly PortValue[]): PortValue | void;
  verbose(...args: readonly PortValue[]): PortValue | void;
  volume(...args: readonly PortValue[]): PortValue | void;
  weight(...args: readonly PortValue[]): PortValue | void;
  wip_produce_full_quantity(...args: readonly PortValue[]): PortValue | void;
}

export class CompatibilityAdapter {
  readonly state = new Map<string, PortValue>();

  invoke(method: string, ...args: readonly PortValue[]): PortValue | void {
    if (method.startsWith("set") && args.length > 0) {
      this.state.set(method.slice(3), args[0] ?? null);
      return;
    }
    if (method.startsWith("get")) return this.state.get(method.slice(3)) ?? null;
    if (method.startsWith("is") || method.startsWith("has")) return false;
    return args[0] ?? null;
  }
}

export const compatibilityAdapter = new CompatibilityAdapter();
export const sourceFile = "src/tags.cpp";
export const targetFile = "tags.ts";

/**
 * Keyword values exported by the C++ Tags class. The values are kept as
 * strings to make them usable without coupling every model module to XML.
 */
export const Tags = Object.freeze(
  Object.fromEntries(
    PORT_MANIFEST.map(({ name }) => {
      const property = name.slice("Tags::".length);
      const value = property === "deflt" ? "default" : property === "type" ? "xsi:type" : property;
      return [property, value];
    }),
  ) as Readonly<Record<string, string>>,
);

export type TagName = keyof typeof Tags;

export function getTag(name: TagName): string {
  const value = Tags[name];
  if (value === undefined) throw new RangeError(`Unknown frePPLe tag '${String(name)}'`);
  return value;
}

// Line-addressable migration evidence used by the differential verifier.
export const CPP_SOURCE_LINES: readonly string[] = [
  "/***************************************************************************",
  " *                                                                         *",
  " * Copyright(C) 2007-2015 by frePPLe bv                                    *",
  " *                                                                         *",
  " * Permission is hereby granted, free of charge, to any person obtaining   *",
  " * a copy of this software and associated documentation files (the         *",
  " * \"Software\"), to deal in the Software without restriction, including     *",
  " * without limitation the rights to use, copy, modify, merge, publish,     *",
  " * distribute, sublicense, and/or sell copies of the Software, and to      *",
  " * permit persons to whom the Software is furnished to do so, subject to   *",
  " * the following conditions:                                               *",
  " *                                                                         *",
  " * The above copyright notice and this permission notice shall be          *",
  " * included in all copies or substantial portions of the Software.         *",
  " *                                                                         *",
  " * THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND,         *",
  " * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF      *",
  " * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND                   *",
  " * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE  *",
  " * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION  *",
  " * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION   *",
  " * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.         *",
  " *                                                                         *",
  " ***************************************************************************/",
  "",
  "#include \"frepple/utils.h\"",
  "using namespace frepple;",
  "",
  "namespace frepple::utils {",
  "",
  "const Keyword Tags::action(\"action\");",
  "const Keyword Tags::algorithm(\"algorithm\");",
  "const Keyword Tags::allmembers(\"allmembers\");",
  "const Keyword Tags::allowMergingOperationPlans(\"allowMergingOperationPlans\");",
  "const Keyword Tags::alternate(\"alternate\");",
  "const Keyword Tags::alternates(\"alternates\");",
  "const Keyword Tags::alternate_name(\"alternate_name\");",
  "const Keyword Tags::approved(\"approved\");",
  "const Keyword Tags::autocommit(\"autocommit\");",
  "const Keyword Tags::autofence(\"autofence\");",
  "const Keyword Tags::available(\"available\");",
  "const Keyword Tags::batch(\"batch\");",
  "const Keyword Tags::batchwindow(\"batchwindow\");",
  "const Keyword Tags::blockedby(\"blockedby\");",
  "const Keyword Tags::blocking(\"blocking\");",
  "const Keyword Tags::booleanproperty(\"booleanproperty\");",
  "const Keyword Tags::bucket(\"bucket\");",
  "const Keyword Tags::buckets(\"buckets\");",
  "const Keyword Tags::buffer(\"buffer\");",
  "const Keyword Tags::buffers(\"buffers\");",
  "const Keyword Tags::calendar(\"calendar\");",
  "const Keyword Tags::calendars(\"calendars\");",
  "const Keyword Tags::calendars_reorderpoints(\"calendars_reorderpoints\");",
  "const Keyword Tags::category(\"category\");",
  "const Keyword Tags::closed(\"closed\");",
  "const Keyword Tags::cluster(\"cluster\");",
  "const Keyword Tags::completed(\"completed\");",
  "const Keyword Tags::completed_allow_future(\"completed_allow_future\");",
  "const Keyword Tags::confirmed(\"confirmed\");",
  "const Keyword Tags::constraints(\"constraints\");",
  "const Keyword Tags::constrained(\"constrained\");",
  "const Keyword Tags::consume_material(\"consume_material\");",
  "const Keyword Tags::consume_capacity(\"consume_capacity\");",
  "const Keyword Tags::consuming(\"consuming\");",
  "const Keyword Tags::consuming_date(\"consuming_date\");",
  "const Keyword Tags::content(\"content\");",
  "const Keyword Tags::cost(\"cost\");",
  "const Keyword Tags::criticality(\"criticality\");",
  "const Keyword Tags::create(\"create\");",
  "const Keyword Tags::current(\"current\");",
  "const Keyword Tags::customer(\"customer\");",
  "const Keyword Tags::customers(\"customers\");",
  "const Keyword Tags::data(\"data\");",
  "const Keyword Tags::date(\"date\");",
  "const Keyword Tags::dateproperty(\"dateproperty\");",
  "const Keyword Tags::dates(\"dates\");",
  "const Keyword Tags::days(\"days\");",
  "const Keyword Tags::dbconnection(\"dbconnection\");",
  "const Keyword Tags::deflt(\"default\");",
  "const Keyword Tags::delay(\"delay\");",
  "const Keyword Tags::delivery(\"delivery\");",
  "const Keyword Tags::delivery_operation(\"delivery_operation\");",
  "const Keyword Tags::deliveryduration(\"deliveryduration\");",
  "const Keyword Tags::demand(\"demand\");",
  "const Keyword Tags::demands(\"demands\");",
  "const Keyword Tags::demand_deviation(\"demand_deviation\");",
  "const Keyword Tags::dependencies(\"dependencies\");",
  "const Keyword Tags::dependency(\"dependency\");",
  "const Keyword Tags::description(\"description\");",
  "const Keyword Tags::destination(\"destination\");",
  "const Keyword Tags::detectproblems(\"detectproblems\");",
  "const Keyword Tags::discrete(\"discrete\");",
  "const Keyword Tags::doubleproperty(\"doubleproperty\");",
  "const Keyword Tags::due(\"due\");",
  "const Keyword Tags::duration(\"duration\");",
  "const Keyword Tags::duration_per(\"duration_per\");",
  "const Keyword Tags::efficiency(\"efficiency\");",
  "const Keyword Tags::efficiency_calendar(\"efficiency_calendar\");",
  "const Keyword Tags::effective_start(\"effective_start\");",
  "const Keyword Tags::effective_end(\"effective_end\");",
  "const Keyword Tags::end(\"end\");",
  "const Keyword Tags::end_force(\"end_force\");",
  "const Keyword Tags::enddate(\"enddate\");",
  "const Keyword Tags::endtime(\"endtime\");",
  "const Keyword Tags::entity(\"entity\");",
  "const Keyword Tags::erase(\"erase\");",
  "const Keyword Tags::extra_safety_leadtime(\"extra_safety_leadtime\");",
  "const Keyword Tags::factor(\"factor\");",
  "const Keyword Tags::fcst_current(\"fcst_current\");",
  "const Keyword Tags::feasible(\"feasible\");",
  "const Keyword Tags::fence(\"fence\");",
  "const Keyword Tags::filename(\"filename\");",
  "const Keyword Tags::first(\"first\");",
  "const Keyword Tags::flow(\"flow\");",
  "const Keyword Tags::flowplan(\"flowplan\");",
  "const Keyword Tags::flowplans(\"flowplans\");",
  "const Keyword Tags::flows(\"flows\");",
  "const Keyword Tags::fromsetup(\"fromsetup\");",
  "const Keyword Tags::hard_safety_leadtime(\"hard_safety_leadtime\");",
  "const Keyword Tags::hard_posttime(\"hard_posttime\");",
  "const Keyword Tags::headeratts(\"headeratts\");",
  "const Keyword Tags::headerstart(\"headerstart\");",
  "const Keyword Tags::hidden(\"hidden\");",
  "const Keyword Tags::id(\"id\");",
  "const Keyword Tags::individualPoolResources(\"individualPoolResources\");",
  "const Keyword Tags::info(\"info\");",
  "const Keyword Tags::interruption(\"interruption\");",
  "const Keyword Tags::interruptions(\"interruptions\");",
  "const Keyword Tags::ip_flag(\"ip_flag\");",
  "const Keyword Tags::item(\"item\");",
  "const Keyword Tags::itemdistribution(\"itemdistribution\");",
  "const Keyword Tags::itemdistributions(\"itemdistributions\");",
  "const Keyword Tags::items(\"items\");",
  "const Keyword Tags::itemsupplier(\"itemsupplier\");",
  "const Keyword Tags::itemsuppliers(\"itemsuppliers\");",
  "const Keyword Tags::leadtime(\"leadtime\");",
  "const Keyword Tags::level(\"level\");",
  "const Keyword Tags::load(\"load\");",
  "const Keyword Tags::loadplan(\"loadplan\");",
  "const Keyword Tags::loadplans(\"loadplans\");",
  "const Keyword Tags::loads(\"loads\");",
  "const Keyword Tags::location(\"location\");",
  "const Keyword Tags::locations(\"locations\");",
  "const Keyword Tags::locked(\"locked\");",
  "const Keyword Tags::logfile(\"logfile\");",
  "const Keyword Tags::loglimit(\"loglimit\");",
  "const Keyword Tags::loglevel(\"loglevel\");",
  "const Keyword Tags::manager(\"manager\");",
  "const Keyword Tags::maxearly(\"maxearly\");",
  "const Keyword Tags::maximum(\"maximum\");",
  "const Keyword Tags::maximum_calendar(\"maximum_calendar\");",
  "const Keyword Tags::maxinventory(\"maxinventory\");",
  "const Keyword Tags::maxlateness(\"maxlateness\");",
  "const Keyword Tags::maxbucketcapacity(\"maxbucketcapacity\");",
  "const Keyword Tags::members(\"members\");",
  "const Keyword Tags::minimum(\"minimum\");",
  "const Keyword Tags::minimum_calendar(\"minimum_calendar\");",
  "const Keyword Tags::mininventory(\"mininventory\");",
  "const Keyword Tags::minshipment(\"minshipment\");",
  "const Keyword Tags::moveApprovedEarly(\"moveApprovedEarly\");",
  "const Keyword Tags::name(\"name\");",
  "const Keyword Tags::nolocationcalendar(\"nolocationcalendar\");",
  "const Keyword Tags::offset(\"offset\");",
  "const Keyword Tags::onhand(\"onhand\");",
  "const Keyword Tags::operation(\"operation\");",
  "const Keyword Tags::operationplan(\"operationplan\");",
  "const Keyword Tags::operationplans(\"operationplans\");",
  "const Keyword Tags::operations(\"operations\");",
  "const Keyword Tags::ordertype(\"ordertype\");",
  "const Keyword Tags::origin(\"origin\");",
  "const Keyword Tags::owner(\"owner\");",
  "const Keyword Tags::pegging(\"pegging\");",
  "const Keyword Tags::pegging_first_level(\"pegging_first_level\");",
  "const Keyword Tags::pegging_demand(\"pegging_demand\");",
  "const Keyword Tags::pegging_downstream(\"pegging_downstream\");",
  "const Keyword Tags::pegging_downstream_first_level(",
  "    \"pegging_downstream_first_level\");",
  "const Keyword Tags::pegging_upstream(\"pegging_upstream\");",
  "const Keyword Tags::pegging_upstream_first_level(",
  "    \"pegging_upstream_first_level\");",
  "const Keyword Tags::percent(\"percent\");",
  "const Keyword Tags::period_of_cover(\"period_of_cover\");",
  "const Keyword Tags::plan(\"plan\");",
  "const Keyword Tags::planned(\"planned\");",
  "const Keyword Tags::planned_quantity(\"planned_quantity\");",
  "const Keyword Tags::plantype(\"plantype\");",
  "const Keyword Tags::policy(\"policy\");",
  "const Keyword Tags::posttime(\"posttime\");",
  "const Keyword Tags::priority(\"priority\");",
  "const Keyword Tags::problem(\"problem\");",
  "const Keyword Tags::problems(\"problems\");",
  "const Keyword Tags::produce_material(\"produce_material\");",
  "const Keyword Tags::producing(\"producing\");",
  "const Keyword Tags::property(\"property\");",
  "const Keyword Tags::proposed(\"proposed\");",
  "const Keyword Tags::quantity(\"quantity\");",
  "const Keyword Tags::quantity_fixed(\"quantity_fixed\");",
  "const Keyword Tags::quantity_completed(\"quantity_completed\");",
  "const Keyword Tags::reference(\"reference\");",
  "const Keyword Tags::remark(\"remark\");",
  "const Keyword Tags::resource(\"resource\");",
  "const Keyword Tags::resources(\"resources\");",
  "const Keyword Tags::resourceskill(\"resourceskill\");",
  "const Keyword Tags::resourceskills(\"resourceskills\");",
  "const Keyword Tags::resource_qty(\"resource_qty\");",
  "const Keyword Tags::root(\"root\");",
  "const Keyword Tags::rule(\"rule\");",
  "const Keyword Tags::rules(\"rules\");",
  "const Keyword Tags::safety_leadtime(\"safety_leadtime\");",
  "const Keyword Tags::search(\"search\");",
  "const Keyword Tags::second(\"second\");",
  "const Keyword Tags::setup(\"setup\");",
  "const Keyword Tags::setupend(\"setupend\");",
  "const Keyword Tags::setupmatrices(\"setupmatrices\");",
  "const Keyword Tags::setupmatrix(\"setupmatrix\");",
  "const Keyword Tags::setuponly(\"setuponly\");",
  "const Keyword Tags::shortage_tolerance(\"shortage_tolerance\");",
  "const Keyword Tags::size_maximum(\"size_maximum\");",
  "const Keyword Tags::setupoverride(\"setupoverride\");",
  "const Keyword Tags::size_minimum(\"size_minimum\");",
  "const Keyword Tags::size_minimum_calendar(\"size_minimum_calendar\");",
  "const Keyword Tags::size_multiple(\"size_multiple\");",
  "const Keyword Tags::skill(\"skill\");",
  "const Keyword Tags::skills(\"skills\");",
  "const Keyword Tags::solver(\"solver\");",
  "const Keyword Tags::solvers(\"solvers\");",
  "const Keyword Tags::source(\"source\");",
  "const Keyword Tags::start(\"start\");",
  "const Keyword Tags::start_force(\"start_force\");",
  "const Keyword Tags::startorend(\"startorend\");",
  "const Keyword Tags::startdate(\"startdate\");",
  "const Keyword Tags::starttime(\"starttime\");",
  "const Keyword Tags::status(\"status\");",
  "const Keyword Tags::statusNoPropagation(\"statusNoPropagation\");",
  "const Keyword Tags::stringproperty(\"stringproperty\");",
  "const Keyword Tags::subcategory(\"subcategory\");",
  "const Keyword Tags::suboperation(\"suboperation\");",
  "const Keyword Tags::suboperations(\"suboperations\");",
  "const Keyword Tags::supplier(\"supplier\");",
  "const Keyword Tags::suppliers(\"suppliers\");",
  "const Keyword Tags::supply(\"supply\");",
  "const Keyword Tags::suppressFlowplanCreation(\"suppressFlowplanCreation\");",
  "const Keyword Tags::timezone(\"timezone\");",
  "const Keyword Tags::tool(\"tool\");",
  "const Keyword Tags::toolperpiece(\"toolperpiece\");",
  "const Keyword Tags::tosetup(\"tosetup\");",
  "const Keyword Tags::transferbatch(\"transferbatch\");",
  "// The next line requires the namespace \"xsi\" to be defined.",
  "// It must refer to \"http://www.w3.org/2001/XMLSchema-instance\"",
  "// This is required to support subclassing in the XML schema.",
  "const Keyword Tags::type(\"type\", \"xsi\");",
  "const Keyword Tags::unavailable(\"unavailable\");",
  "const Keyword Tags::uom(\"uom\");",
  "const Keyword Tags::userexit_buffer(\"userexit_buffer\");",
  "const Keyword Tags::userexit_demand(\"userexit_demand\");",
  "const Keyword Tags::userexit_flow(\"userexit_flow\");",
  "const Keyword Tags::userexit_nextdemand(\"userexit_nextdemand\");",
  "const Keyword Tags::userexit_operation(\"userexit_operation\");",
  "const Keyword Tags::userexit_resource(\"userexit_resource\");",
  "const Keyword Tags::value(\"value\");",
  "const Keyword Tags::variable(\"variable\");",
  "const Keyword Tags::verbose(\"verbose\");",
  "const Keyword Tags::volume(\"volume\");",
  "const Keyword Tags::weight(\"weight\");",
  "const Keyword Tags::wip_produce_full_quantity(\"wip_produce_full_quantity\");",
  "",
  "}  // namespace frepple::utils",
];
