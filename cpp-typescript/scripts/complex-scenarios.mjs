const DAY = 86_400;
const HOUR = 3_600;

function timestamp(dayOffset, hour = 0) {
  return new Date(Date.UTC(2026, 0, 1 + dayOffset, hour)).toISOString().slice(0, 19);
}

function uniqueItems(buffers) {
  return [...new Set(buffers.map((buffer) => buffer.item))].map((name) => ({ name }));
}

function demandSeries({
  prefix, products, count, firstDay, ordersPerDay = 2, quantities,
  dueHours = [0, 6, 12, 18], priorityBand = 12,
}) {
  return Array.from({ length: count }, (_, index) => {
    const product = products[index % products.length];
    return {
      name: `${prefix} ${String(index + 1).padStart(3, "0")} ${product.code}`,
      item: product.item,
      operation: product.delivery,
      quantity: quantities[index % quantities.length],
      due: timestamp(firstDay + Math.floor(index / ordersPerDay), dueHours[index % dueHours.length]),
      priority: (index % priorityBand) + 1,
    };
  });
}

function scenario(name, industry, description, coverage, model) {
  return { name, industry, description, coverage, model };
}

function automotiveScenario() {
  const vehicles = [
    { code: "SEDAN-BLK", item: "black sedan", family: "sedan", color: "black", weld: 14, paint: 10, assembly: 18 },
    { code: "SEDAN-WHT", item: "white sedan", family: "sedan", color: "white", weld: 14, paint: 9, assembly: 18 },
    { code: "SUV-BLK", item: "black suv", family: "suv", color: "black", weld: 18, paint: 12, assembly: 22 },
    { code: "SUV-RED", item: "red suv", family: "suv", color: "red", weld: 18, paint: 13, assembly: 22 },
  ].map((product) => ({
    ...product,
    weldOperation: `weld ${product.code}`,
    paintOperation: `paint ${product.code}`,
    assemblyOperation: `assemble ${product.code}`,
    routing: `build ${product.code}`,
    delivery: `ship ${product.code}`,
  }));
  const operations = vehicles.flatMap((product) => [
    { name: product.weldOperation, type: "fixed_time", duration: product.weld * HOUR, sizeMinimum: 1, sizeMaximum: 4, cost: 120 },
    { name: product.paintOperation, type: "fixed_time", duration: product.paint * HOUR, sizeMinimum: 1, sizeMaximum: 4, cost: 90 },
    { name: product.assemblyOperation, type: "fixed_time", duration: product.assembly * HOUR, sizeMinimum: 1, sizeMaximum: 4, cost: 160 },
    {
      name: product.routing, type: "routing",
      suboperations: [
        { operation: product.weldOperation, priority: 1 },
        { operation: product.paintOperation, priority: 2 },
        { operation: product.assemblyOperation, priority: 3 },
      ],
    },
    { name: product.delivery, type: "fixed_time", duration: 3 * HOUR, cost: 20 },
  ]);
  const buffers = [
    { name: "automotive steel", item: "automotive steel", onhand: 180 },
    { name: "powertrain", item: "powertrain", onhand: 105 },
    { name: "electronics kit", item: "electronics kit", onhand: 120 },
    ...vehicles.map((product) => ({ name: product.item, item: product.item, producing: product.routing, onhand: 0 })),
  ];
  const loads = vehicles.flatMap((product) => [
    {
      operation: product.weldOperation, resource: "body line A", quantity: 1,
      name: `body line ${product.code}`, priority: 1, search: "PRIORITY", setup: product.family,
    },
    {
      operation: product.weldOperation, resource: "body line B", quantity: 1,
      name: `body line ${product.code}`, priority: 2, search: "PRIORITY", setup: product.family,
    },
    { operation: product.paintOperation, resource: "paint booth", quantity: 1, setup: product.color },
    {
      operation: product.assemblyOperation, resource: "assembly team pool", quantity: 1,
      skill: "vehicle assembly", search: "PRIORITY",
    },
  ]);
  const flows = vehicles.flatMap((product) => [
    { type: "start", operation: product.delivery, buffer: product.item, quantity: -1 },
    { type: "start", operation: product.weldOperation, buffer: "automotive steel", quantity: product.family === "suv" ? -3 : -2 },
    { type: "start", operation: product.assemblyOperation, buffer: "powertrain", quantity: -1 },
    { type: "start", operation: product.assemblyOperation, buffer: "electronics kit", quantity: -1 },
    { type: "end", operation: product.assemblyOperation, buffer: product.item, quantity: 1 },
  ]);
  return scenario(
    "automotive_mixed_model",
    "汽车整车制造",
    "Forty-eight mixed-model vehicle orders use routings, alternate body lines, paint and body setups, skill pools and finite components",
    ["多车型混线", "三段 routing", "备用焊装线", "颜色/车型换型", "技能资源池", "有限零部件", "批量上下限"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 12 * HOUR, minimumDelay: HOUR, rotateResources: true },
      items: uniqueItems(buffers), operations, buffers,
      setupMatrices: [
        {
          name: "body family change", rules: [
            { priority: 1, from: "idle", to: "sedan|suv", duration: 2 * HOUR, cost: 20 },
            { priority: 2, from: "sedan", to: "suv", duration: 4 * HOUR, cost: 35 },
            { priority: 3, from: "suv", to: "sedan", duration: 3 * HOUR, cost: 30 },
            { priority: 99, from: ".*", to: ".*", duration: HOUR, cost: 10 },
          ],
        },
        {
          name: "paint color change", rules: [
            { priority: 1, from: "clean", to: "white", duration: HOUR, cost: 10 },
            { priority: 2, from: "clean", to: "black|red", duration: 2 * HOUR, cost: 18 },
            { priority: 3, from: "black", to: "white|red", duration: 4 * HOUR, cost: 30 },
            { priority: 4, from: "red", to: "white|black", duration: 5 * HOUR, cost: 35 },
            { priority: 99, from: ".*", to: ".*", duration: HOUR, cost: 8 },
          ],
        },
      ],
      resources: [
        { name: "body line A", maximum: 4, maxearly: 70 * DAY, setupMatrix: "body family change", setup: "idle", efficiency: 100 },
        { name: "body line B", maximum: 3, maxearly: 70 * DAY, setupMatrix: "body family change", setup: "idle", efficiency: 88 },
        { name: "paint booth", maximum: 3, maxearly: 70 * DAY, setupMatrix: "paint color change", setup: "clean", efficiency: 95 },
        { name: "assembly team pool", maximum: 1, maxearly: 70 * DAY, efficiency: 100 },
        { name: "assembly team east", owner: "assembly team pool", maximum: 4, maxearly: 70 * DAY, efficiency: 105 },
        { name: "assembly team west", owner: "assembly team pool", maximum: 4, maxearly: 70 * DAY, efficiency: 95 },
        { name: "assembly team flex", owner: "assembly team pool", maximum: 3, maxearly: 70 * DAY, efficiency: 85 },
      ],
      skills: [{ name: "vehicle assembly" }],
      resourceSkills: [
        { resource: "assembly team east", skill: "vehicle assembly", priority: 1 },
        { resource: "assembly team west", skill: "vehicle assembly", priority: 2 },
        { resource: "assembly team flex", skill: "vehicle assembly", priority: 3 },
      ],
      loads, flows,
      demands: demandSeries({
        prefix: "vehicle order", products: vehicles, count: 48, firstDay: 25, ordersPerDay: 3,
        quantities: [1, 2, 3, 1, 4, 2], dueHours: [0, 8, 16], priorityBand: 10,
      }),
    },
  );
}

function electronicsScenario() {
  const products = [
    { code: "CTRL-A", item: "controller A", reflow: "leadfree" },
    { code: "CTRL-B", item: "controller B", reflow: "leadfree" },
    { code: "SENSOR-C", item: "sensor C", reflow: "lowtemp" },
    { code: "SENSOR-D", item: "sensor D", reflow: "lowtemp" },
  ].map((product) => ({
    ...product,
    fast: `fast process ${product.code}`,
    standard: `standard process ${product.code}`,
    make: `select process ${product.code}`,
    delivery: `ship ${product.code}`,
  }));
  const operations = products.flatMap((product, index) => [
    { name: product.fast, type: "fixed_time", duration: (8 + index) * HOUR, sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 8, cost: 80 },
    { name: product.standard, type: "fixed_time", duration: (13 + index) * HOUR, sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 8, cost: 45 },
    {
      name: product.make, type: "alternate", search: "PRIORITY",
      suboperations: [{ operation: product.fast, priority: 1 }, { operation: product.standard, priority: 2 }],
    },
    { name: product.delivery, type: "fixed_time", duration: 2 * HOUR, cost: 8 },
  ]);
  const buffers = [
    { name: "microcontroller premium", item: "microcontroller premium", onhand: 18 },
    { name: "microcontroller standard", item: "microcontroller standard", onhand: 180 },
    { name: "pcb panel", item: "pcb panel", onhand: 240 },
    { name: "sensor die", item: "sensor die", onhand: 140 },
    ...products.map((product) => ({ name: product.item, item: product.item, producing: product.make, onhand: 0 })),
  ];
  const loads = products.flatMap((product) => [
    {
      operation: product.fast, resource: "smt highspeed", quantity: 1,
      name: `smt ${product.code}`, priority: 1, search: "PRIORITY", setup: product.reflow,
    },
    {
      operation: product.fast, resource: "smt flexible", quantity: 1,
      name: `smt ${product.code}`, priority: 2, search: "PRIORITY", setup: product.reflow,
    },
    { operation: product.fast, resource: "ict pool", quantity: 1, skill: "advanced ict", search: "PRIORITY" },
    { operation: product.standard, resource: "smt standard", quantity: 1, setup: product.reflow },
    { operation: product.standard, resource: "functional test", quantity: 1 },
  ]);
  const flows = products.flatMap((product) => [
    { type: "start", operation: product.delivery, buffer: product.item, quantity: -1 },
    { type: "end", operation: product.fast, buffer: product.item, quantity: 1 },
    { type: "start", operation: product.fast, buffer: "microcontroller premium", quantity: -1 },
    { type: "start", operation: product.fast, buffer: "pcb panel", quantity: -1 },
    { type: "end", operation: product.standard, buffer: product.item, quantity: 1 },
    { type: "start", operation: product.standard, buffer: "microcontroller standard", quantity: -1 },
    { type: "start", operation: product.standard, buffer: product.code.startsWith("SENSOR") ? "sensor die" : "pcb panel", quantity: -1 },
  ]);
  return scenario(
    "electronics_high_mix",
    "电子装配",
    "Sixty high-mix electronics orders exercise alternate processes, alternate SMT lines, scarce premium chips, skills, setup families and lot sizing",
    ["高混低量", "备用工艺", "备用 SMT 线", "稀缺芯片", "检测技能", "炉温换型", "整数批量"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 6 * HOUR, minimumDelay: 30 * 60, rotateResources: false },
      items: uniqueItems(buffers), operations, buffers,
      setupMatrices: [{
        name: "reflow profile", rules: [
          { priority: 1, from: "idle", to: "leadfree|lowtemp", duration: HOUR, cost: 5 },
          { priority: 2, from: "leadfree", to: "lowtemp", duration: 3 * HOUR, cost: 16 },
          { priority: 3, from: "lowtemp", to: "leadfree", duration: 2 * HOUR, cost: 12 },
          { priority: 99, from: ".*", to: ".*", duration: HOUR, cost: 4 },
        ],
      }],
      resources: [
        { name: "smt highspeed", maximum: 4, maxearly: 50 * DAY, setupMatrix: "reflow profile", setup: "idle", efficiency: 115 },
        { name: "smt flexible", maximum: 3, maxearly: 50 * DAY, setupMatrix: "reflow profile", setup: "idle", efficiency: 92 },
        { name: "smt standard", maximum: 4, maxearly: 50 * DAY, setupMatrix: "reflow profile", setup: "idle", efficiency: 85 },
        { name: "ict pool", maximum: 1, maxearly: 50 * DAY, efficiency: 100 },
        { name: "ict senior", owner: "ict pool", maximum: 3, maxearly: 50 * DAY, efficiency: 110 },
        { name: "ict regular", owner: "ict pool", maximum: 3, maxearly: 50 * DAY, efficiency: 95 },
        { name: "ict trainee", owner: "ict pool", maximum: 2, maxearly: 50 * DAY, efficiency: 80 },
        { name: "functional test", maximum: 5, maxearly: 50 * DAY, efficiency: 100 },
      ],
      skills: [{ name: "advanced ict" }],
      resourceSkills: [
        { resource: "ict senior", skill: "advanced ict", priority: 1 },
        { resource: "ict regular", skill: "advanced ict", priority: 2 },
      ],
      loads, flows,
      demands: demandSeries({
        prefix: "electronics order", products, count: 60, firstDay: 18, ordersPerDay: 4,
        quantities: [1, 2, 4, 3, 2, 5], dueHours: [2, 8, 14, 20], priorityBand: 15,
      }),
    },
  );
}

function pharmaceuticalScenario() {
  const medicines = [
    { code: "TAB-A", item: "tablet A", active: "active A", family: "allergen-free", blendHours: 20, pressHours: 12 },
    { code: "TAB-B", item: "tablet B", active: "active B", family: "potent", blendHours: 24, pressHours: 14 },
    { code: "CAP-C", item: "capsule C", active: "active C", family: "allergen-free", blendHours: 18, pressHours: 16 },
  ].map((product) => ({
    ...product,
    blend: `blend ${product.code}`,
    form: `form ${product.code}`,
    inspect: `inspect ${product.code}`,
    route: `batch ${product.code}`,
    delivery: `release ${product.code}`,
  }));
  const operations = medicines.flatMap((product) => [
    { name: product.blend, type: "fixed_time", duration: product.blendHours * HOUR, sizeMinimum: 2, sizeMultiple: 1, sizeMaximum: 10, cost: 140 },
    { name: product.form, type: "fixed_time", duration: product.pressHours * HOUR, sizeMinimum: 2, sizeMultiple: 1, sizeMaximum: 10, cost: 170 },
    { name: product.inspect, type: "fixed_time", duration: 18 * HOUR, sizeMinimum: 1, sizeMaximum: 10, cost: 100 },
    {
      name: product.route, type: "routing", suboperations: [
        { operation: product.blend, priority: 1 },
        { operation: product.form, priority: 2 },
        { operation: product.inspect, priority: 3 },
      ],
    },
    { name: product.delivery, type: "fixed_time", duration: 6 * HOUR, cost: 25 },
  ]);
  const buffers = [
    { name: "excipient", item: "excipient", onhand: 420 },
    { name: "active A", item: "active A", onhand: 85 },
    { name: "active B", item: "active B", onhand: 75 },
    { name: "active C", item: "active C", onhand: 90 },
    { name: "primary packaging", item: "primary packaging", onhand: 280 },
    ...medicines.map((product) => ({ name: product.item, item: product.item, producing: product.route, onhand: 0 })),
  ];
  const loads = medicines.flatMap((product) => [
    { operation: product.blend, resource: "blender", quantity: 1, setup: product.family },
    {
      operation: product.form, resource: "forming line A", quantity: 1,
      name: `forming ${product.code}`, priority: 1, search: "PRIORITY", setup: product.code,
    },
    {
      operation: product.form, resource: "forming line B", quantity: 1,
      name: `forming ${product.code}`, priority: 2, search: "PRIORITY", setup: product.code,
    },
    { operation: product.inspect, resource: "qa pool", quantity: 1, skill: "batch release", search: "PRIORITY" },
  ]);
  const flows = medicines.flatMap((product) => [
    { type: "start", operation: product.delivery, buffer: product.item, quantity: -1 },
    { type: "start", operation: product.blend, buffer: product.active, quantity: -1 },
    { type: "start", operation: product.blend, buffer: "excipient", quantity: -2 },
    { type: "start", operation: product.form, buffer: "primary packaging", quantity: -1 },
    { type: "end", operation: product.inspect, buffer: product.item, quantity: 1 },
  ]);
  return scenario(
    "pharma_batch_release",
    "制药批生产",
    "Thirty-six medicine demands combine batch-size rules, three-stage routings, sanitation and product setups, finite actives and qualified QA release",
    ["批生产", "最小/倍增/最大批量", "三段工艺", "清场换型", "有限 API", "QA 资质", "备用成型线"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 2 * DAY, minimumDelay: 4 * HOUR, administrativeLeadTime: DAY },
      items: uniqueItems(buffers), operations, buffers,
      setupMatrices: [
        {
          name: "sanitation class", rules: [
            { priority: 1, from: "clean", to: "allergen-free", duration: 3 * HOUR, cost: 30 },
            { priority: 2, from: "clean", to: "potent", duration: 5 * HOUR, cost: 50 },
            { priority: 3, from: "potent", to: "allergen-free", duration: 12 * HOUR, cost: 110 },
            { priority: 4, from: "allergen-free", to: "potent", duration: 8 * HOUR, cost: 85 },
            { priority: 99, from: ".*", to: ".*", duration: 2 * HOUR, cost: 20 },
          ],
        },
        {
          name: "forming tooling", rules: [
            { priority: 1, from: "idle", to: "TAB-A|TAB-B|CAP-C", duration: 2 * HOUR, cost: 20 },
            { priority: 99, from: ".*", to: ".*", duration: 5 * HOUR, cost: 45 },
          ],
        },
      ],
      resources: [
        { name: "blender", maximum: 2, maxearly: 90 * DAY, setupMatrix: "sanitation class", setup: "clean", efficiency: 100 },
        { name: "forming line A", maximum: 3, maxearly: 90 * DAY, setupMatrix: "forming tooling", setup: "idle", efficiency: 100 },
        { name: "forming line B", maximum: 2, maxearly: 90 * DAY, setupMatrix: "forming tooling", setup: "idle", efficiency: 82 },
        { name: "qa pool", maximum: 1, maxearly: 90 * DAY, efficiency: 100 },
        { name: "qa pharmacist 1", owner: "qa pool", maximum: 2, maxearly: 90 * DAY, efficiency: 100 },
        { name: "qa pharmacist 2", owner: "qa pool", maximum: 2, maxearly: 90 * DAY, efficiency: 95 },
        { name: "qa analyst", owner: "qa pool", maximum: 2, maxearly: 90 * DAY, efficiency: 85 },
      ],
      skills: [{ name: "batch release" }],
      resourceSkills: [
        { resource: "qa pharmacist 1", skill: "batch release", priority: 1 },
        { resource: "qa pharmacist 2", skill: "batch release", priority: 2 },
      ],
      loads, flows,
      demands: demandSeries({
        prefix: "medicine demand", products: medicines, count: 36, firstDay: 32, ordersPerDay: 2,
        quantities: [2, 3, 5, 4, 6, 2], dueHours: [6, 18], priorityBand: 9,
      }),
    },
  );
}

function foodScenario() {
  const foods = [
    { code: "YOG-NAT", item: "natural yogurt", recipe: "natural", material: "natural culture", hours: 9 },
    { code: "YOG-BRY", item: "berry yogurt", recipe: "berry", material: "berry culture", hours: 10 },
    { code: "DRINK-MNG", item: "mango drink", recipe: "mango", material: "mango concentrate", hours: 8 },
    { code: "DRINK-PEA", item: "peach drink", recipe: "peach", material: "peach concentrate", hours: 8 },
  ].map((product) => ({ ...product, make: `process ${product.code}`, delivery: `dispatch ${product.code}` }));
  const operations = foods.flatMap((product) => [
    { name: product.make, type: "fixed_time", duration: product.hours * HOUR, sizeMinimum: 1, sizeMaximum: 12, cost: 35 },
    { name: product.delivery, type: "fixed_time", duration: HOUR, cost: 5 },
  ]);
  const buffers = [
    { name: "raw milk", item: "raw milk", onhand: 360 },
    { name: "sugar", item: "sugar", onhand: 240 },
    { name: "natural culture", item: "natural culture", onhand: 28 },
    { name: "berry culture", item: "berry culture", onhand: 18 },
    { name: "mango concentrate", item: "mango concentrate", onhand: 45 },
    { name: "peach concentrate", item: "peach concentrate", onhand: 40 },
    { name: "generic fruit base", item: "generic fruit base", onhand: 120 },
    { name: "cups", item: "cups", onhand: 480 },
    ...foods.map((product) => ({ name: product.item, item: product.item, producing: product.make, onhand: 0 })),
  ];
  const loads = foods.flatMap((product) => [
    {
      operation: product.make, resource: "process tank A", quantity: 1,
      name: `tank ${product.code}`, priority: 1, search: "PRIORITY", setup: product.recipe,
    },
    {
      operation: product.make, resource: "process tank B", quantity: 1,
      name: `tank ${product.code}`, priority: 2, search: "PRIORITY", setup: product.recipe,
    },
    { operation: product.make, resource: "filling crew", quantity: 0.5 },
  ]);
  const flows = foods.flatMap((product) => [
    { type: "start", operation: product.delivery, buffer: product.item, quantity: -1 },
    { type: "end", operation: product.make, buffer: product.item, quantity: 1 },
    { type: "start", operation: product.make, buffer: "raw milk", quantity: -2 },
    { type: "start", operation: product.make, buffer: "sugar", quantity: -0.5 },
    { type: "start", operation: product.make, buffer: "cups", quantity: -1 },
    { type: "start", operation: product.make, buffer: product.material, quantity: -0.25, name: `ingredient ${product.code}`, priority: 1 },
    { type: "start", operation: product.make, buffer: "generic fruit base", quantity: -0.25, name: `ingredient ${product.code}`, priority: 2 },
  ]);
  return scenario(
    "food_fresh_batches",
    "食品饮料",
    "Seventy-two fresh-food orders share processing tanks and fillers, use recipe cleanovers, finite ingredients and alternate recipes under an unconstrained plan parameter",
    ["短交期高频需求", "共享罐体和灌装", "配方清洗", "有限原料", "替代配方", "备用罐体", "plantype=2"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 2, lazyDelay: 3 * HOUR, minimumDelay: 15 * 60, rotateResources: true },
      items: uniqueItems(buffers), operations, buffers,
      setupMatrices: [{
        name: "recipe cleanover", rules: [
          { priority: 1, from: "clean", to: "natural|berry|mango|peach", duration: 30 * 60, cost: 3 },
          { priority: 2, from: "natural|berry", to: "mango|peach", duration: 2 * HOUR, cost: 12 },
          { priority: 3, from: "mango|peach", to: "natural|berry", duration: 3 * HOUR, cost: 18 },
          { priority: 99, from: ".*", to: ".*", duration: HOUR, cost: 7 },
        ],
      }],
      resources: [
        { name: "process tank A", maximum: 5, maxearly: 20 * DAY, setupMatrix: "recipe cleanover", setup: "clean", efficiency: 100 },
        { name: "process tank B", maximum: 4, maxearly: 20 * DAY, setupMatrix: "recipe cleanover", setup: "clean", efficiency: 88 },
        { name: "filling crew", maximum: 8, maxearly: 20 * DAY, efficiency: 105 },
      ],
      skills: [], resourceSkills: [], loads, flows,
      demands: demandSeries({
        prefix: "fresh order", products: foods, count: 72, firstDay: 10, ordersPerDay: 6,
        quantities: [1, 2, 3, 4, 2, 5], dueHours: [2, 6, 10, 14, 18, 22], priorityBand: 18,
      }),
    },
  );
}

function aerospaceScenario() {
  const jobs = [
    { code: "ENG-INSP", item: "engine inspection", family: "engine", skill: "engine cert", material: "engine spares", hours: 30 },
    { code: "GEAR-OH", item: "landing gear overhaul", family: "gear", skill: "structures cert", material: "structure spares", hours: 38 },
    { code: "AVIO-REP", item: "avionics repair", family: "avionics", skill: "avionics cert", material: "avionics modules", hours: 22 },
  ].map((product) => ({
    ...product,
    inspect: `diagnose ${product.code}`,
    repair: `repair ${product.code}`,
    signoff: `signoff ${product.code}`,
    route: `maintain ${product.code}`,
    delivery: `return ${product.code}`,
  }));
  const operations = jobs.flatMap((product) => [
    { name: product.inspect, type: "fixed_time", duration: Math.round(product.hours * 0.3) * HOUR, sizeMinimum: 1, sizeMaximum: 1, cost: 250 },
    { name: product.repair, type: "fixed_time", duration: Math.round(product.hours * 0.55) * HOUR, sizeMinimum: 1, sizeMaximum: 1, cost: 500 },
    { name: product.signoff, type: "fixed_time", duration: Math.round(product.hours * 0.15) * HOUR, sizeMinimum: 1, sizeMaximum: 1, cost: 180 },
    {
      name: product.route, type: "routing", suboperations: [
        { operation: product.inspect, priority: 1 },
        { operation: product.repair, priority: 2 },
        { operation: product.signoff, priority: 3 },
      ],
    },
    { name: product.delivery, type: "fixed_time", duration: 2 * HOUR, cost: 30 },
  ]);
  const buffers = [
    { name: "engine spares", item: "engine spares", onhand: 14 },
    { name: "structure spares", item: "structure spares", onhand: 15 },
    { name: "avionics modules", item: "avionics modules", onhand: 16 },
    { name: "generic repair kit", item: "generic repair kit", onhand: 80 },
    ...jobs.map((product) => ({ name: product.item, item: product.item, producing: product.route, onhand: 0 })),
  ];
  const loads = jobs.flatMap((product) => [
    { operation: product.inspect, resource: "inspection pool", quantity: 1, skill: product.skill, search: "PRIORITY" },
    {
      operation: product.repair, resource: "repair bay 1", quantity: 1,
      name: `bay ${product.code}`, priority: 1, search: "PRIORITY", setup: product.family,
    },
    {
      operation: product.repair, resource: "repair bay 2", quantity: 1,
      name: `bay ${product.code}`, priority: 2, search: "PRIORITY", setup: product.family,
    },
    { operation: product.signoff, resource: "signoff pool", quantity: 1, skill: product.skill, search: "PRIORITY" },
  ]);
  const flows = jobs.flatMap((product) => [
    { type: "start", operation: product.delivery, buffer: product.item, quantity: -1 },
    { type: "start", operation: product.repair, buffer: product.material, quantity: -1, name: `repair material ${product.code}`, priority: 1 },
    { type: "start", operation: product.repair, buffer: "generic repair kit", quantity: -1, name: `repair material ${product.code}`, priority: 2 },
    { type: "end", operation: product.signoff, buffer: product.item, quantity: 1 },
  ]);
  return scenario(
    "aerospace_mro",
    "航空维修 MRO",
    "Thirty MRO jobs use serial routings, unit lot sizes, certification-specific resource pools, alternate bays, bay setups and substitute repair kits",
    ["单件维修", "诊断-维修-放行 routing", "多资质技师", "备用工位", "工位换型", "专用/通用备件替代", "低产能长周期"],
    {
      current: timestamp(0),
      solver: { constraints: 13, plantype: 1, lazyDelay: DAY, minimumDelay: 2 * HOUR, rotateResources: false },
      items: uniqueItems(buffers), operations, buffers,
      setupMatrices: [{
        name: "repair bay tooling", rules: [
          { priority: 1, from: "idle", to: "engine|gear|avionics", duration: 2 * HOUR, cost: 15 },
          { priority: 2, from: "engine", to: "gear|avionics", duration: 6 * HOUR, cost: 45 },
          { priority: 3, from: "gear", to: "engine|avionics", duration: 5 * HOUR, cost: 40 },
          { priority: 99, from: ".*", to: ".*", duration: 3 * HOUR, cost: 25 },
        ],
      }],
      resources: [
        { name: "inspection pool", maximum: 1, maxearly: 100 * DAY, efficiency: 100 },
        { name: "inspector engine", owner: "inspection pool", maximum: 2, maxearly: 100 * DAY, efficiency: 100 },
        { name: "inspector structures", owner: "inspection pool", maximum: 2, maxearly: 100 * DAY, efficiency: 95 },
        { name: "inspector avionics", owner: "inspection pool", maximum: 2, maxearly: 100 * DAY, efficiency: 105 },
        { name: "repair bay 1", maximum: 2, maxearly: 100 * DAY, setupMatrix: "repair bay tooling", setup: "idle", efficiency: 100 },
        { name: "repair bay 2", maximum: 2, maxearly: 100 * DAY, setupMatrix: "repair bay tooling", setup: "idle", efficiency: 90 },
        { name: "signoff pool", maximum: 1, maxearly: 100 * DAY, efficiency: 100 },
        { name: "signoff engine", owner: "signoff pool", maximum: 2, maxearly: 100 * DAY, efficiency: 100 },
        { name: "signoff structures", owner: "signoff pool", maximum: 2, maxearly: 100 * DAY, efficiency: 100 },
        { name: "signoff avionics", owner: "signoff pool", maximum: 2, maxearly: 100 * DAY, efficiency: 100 },
      ],
      skills: [{ name: "engine cert" }, { name: "structures cert" }, { name: "avionics cert" }],
      resourceSkills: [
        { resource: "inspector engine", skill: "engine cert", priority: 1 },
        { resource: "signoff engine", skill: "engine cert", priority: 1 },
        { resource: "inspector structures", skill: "structures cert", priority: 1 },
        { resource: "signoff structures", skill: "structures cert", priority: 1 },
        { resource: "inspector avionics", skill: "avionics cert", priority: 1 },
        { resource: "signoff avionics", skill: "avionics cert", priority: 1 },
      ],
      loads, flows,
      demands: demandSeries({
        prefix: "mro work order", products: jobs, count: 30, firstDay: 35, ordersPerDay: 2,
        quantities: [1], dueHours: [8, 20], priorityBand: 6,
      }),
    },
  );
}

function packagingScenario() {
  const products = [
    { code: "POUCH-S", item: "small pouch", format: "pouch-small", material: "film standard", hours: 7 },
    { code: "POUCH-L", item: "large pouch", format: "pouch-large", material: "film standard", hours: 9 },
    { code: "CARTON-S", item: "small carton", format: "carton-small", material: "board standard", hours: 8 },
    { code: "CARTON-L", item: "large carton", format: "carton-large", material: "board premium", hours: 11 },
  ].map((product) => ({ ...product, make: `convert ${product.code}`, delivery: `ship ${product.code}` }));
  const operations = products.flatMap((product) => [
    { name: product.make, type: "fixed_time", duration: product.hours * HOUR, sizeMinimum: 2, sizeMultiple: 2, sizeMaximum: 12, cost: 40 },
    { name: product.delivery, type: "fixed_time", duration: HOUR, cost: 4 },
  ]);
  const buffers = [
    { name: "film standard", item: "film standard", onhand: 300 },
    { name: "film recycled", item: "film recycled", onhand: 180 },
    { name: "board standard", item: "board standard", onhand: 260 },
    { name: "board premium", item: "board premium", onhand: 75 },
    { name: "board substitute", item: "board substitute", onhand: 180 },
    { name: "ink", item: "ink", onhand: 500 },
    ...products.map((product) => ({ name: product.item, item: product.item, producing: product.make, onhand: 0 })),
  ];
  const alternateMaterial = {
    "film standard": "film recycled",
    "board standard": "board substitute",
    "board premium": "board substitute",
  };
  const loads = products.flatMap((product) => [
    {
      operation: product.make, resource: "converter A", quantity: 1,
      name: `converter ${product.code}`, priority: 1, search: "PRIORITY", setup: product.format,
    },
    {
      operation: product.make, resource: "converter B", quantity: 1,
      name: `converter ${product.code}`, priority: 2, search: "PRIORITY", setup: product.format,
    },
    { operation: product.make, resource: "print crew", quantity: 0.5 },
  ]);
  const flows = products.flatMap((product) => [
    { type: "start", operation: product.delivery, buffer: product.item, quantity: -1 },
    { type: "end", operation: product.make, buffer: product.item, quantity: 1 },
    { type: "start", operation: product.make, buffer: product.material, quantity: -1, name: `substrate ${product.code}`, priority: 1 },
    { type: "start", operation: product.make, buffer: alternateMaterial[product.material], quantity: -1, name: `substrate ${product.code}`, priority: 2 },
    { type: "start", operation: product.make, buffer: "ink", quantity: -0.5 },
  ]);
  return scenario(
    "packaging_campaigns",
    "快消包装",
    "Eighty packaging orders combine campaign-like format setups, alternate converters, substitute substrates, shared printing and even-number lot sizing with capacity constraints disabled",
    ["大需求量", "规格换型", "备用设备", "替代基材", "共享印刷", "偶数批量", "constraints=11"],
    {
      current: timestamp(0),
      solver: { constraints: 11, plantype: 1, lazyDelay: 4 * HOUR, minimumDelay: 30 * 60, rotateResources: true },
      items: uniqueItems(buffers), operations, buffers,
      setupMatrices: [{
        name: "converter format", rules: [
          { priority: 1, from: "idle", to: "pouch-small|pouch-large|carton-small|carton-large", duration: HOUR, cost: 5 },
          { priority: 2, from: "pouch-small|pouch-large", to: "carton-small|carton-large", duration: 4 * HOUR, cost: 28 },
          { priority: 3, from: "carton-small|carton-large", to: "pouch-small|pouch-large", duration: 5 * HOUR, cost: 32 },
          { priority: 99, from: ".*", to: ".*", duration: 2 * HOUR, cost: 14 },
        ],
      }],
      resources: [
        { name: "converter A", maximum: 6, maxearly: 40 * DAY, setupMatrix: "converter format", setup: "idle", efficiency: 105 },
        { name: "converter B", maximum: 5, maxearly: 40 * DAY, setupMatrix: "converter format", setup: "idle", efficiency: 90 },
        { name: "print crew", maximum: 10, maxearly: 40 * DAY, efficiency: 100 },
      ],
      skills: [], resourceSkills: [], loads, flows,
      demands: demandSeries({
        prefix: "packaging order", products, count: 80, firstDay: 16, ordersPerDay: 5,
        quantities: [2, 4, 6, 8, 10, 12], dueHours: [1, 5, 10, 15, 20], priorityBand: 20,
      }),
    },
  );
}

function peakLoadBoundaryScenario() {
  const products = Array.from({ length: 6 }, (_, index) => {
    const code = `PEAK-${String(index + 1).padStart(2, "0")}`;
    return {
      code,
      item: `peak product ${index + 1}`,
      family: index % 2 ? "family-b" : "family-a",
      make: `peak make ${code}`,
      delivery: `peak ship ${code}`,
    };
  });
  const operations = products.flatMap((product, index) => [
    {
      name: product.make, type: "fixed_time", duration: (2 + index % 3) * HOUR,
      sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 20, cost: 20 + index,
    },
    { name: product.delivery, type: "fixed_time", duration: 15 * 60, sizeMaximum: 20, cost: 2 },
  ]);
  const buffers = [
    { name: "peak raw preferred", item: "peak raw preferred", onhand: 520 },
    { name: "peak raw substitute", item: "peak raw substitute", onhand: 360 },
    ...products.map((product) => ({ name: product.item, item: product.item, producing: product.make, onhand: 0 })),
  ];
  const loads = products.flatMap((product) => [
    {
      operation: product.make, resource: "peak line A", quantity: 1,
      name: `peak line ${product.code}`, priority: 1, search: "PRIORITY", setup: product.family,
    },
    {
      operation: product.make, resource: "peak line B", quantity: 1,
      name: `peak line ${product.code}`, priority: 2, search: "PRIORITY", setup: product.family,
    },
  ]);
  const flows = products.flatMap((product) => [
    { type: "start", operation: product.delivery, buffer: product.item, quantity: -1 },
    { type: "end", operation: product.make, buffer: product.item, quantity: 1 },
    {
      type: "start", operation: product.make, buffer: "peak raw preferred", quantity: -1,
      name: `peak substrate ${product.code}`, priority: 1,
    },
    {
      type: "start", operation: product.make, buffer: "peak raw substitute", quantity: -1,
      name: `peak substrate ${product.code}`, priority: 2,
    },
  ]);
  const demands = demandSeries({
    prefix: "peak order", products, count: 180, firstDay: 20, ordersPerDay: 30,
    quantities: [1, 2, 3, 5, 8, 13], dueHours: [8, 8, 8, 12, 12, 12], priorityBand: 30,
  });
  return scenario(
    "boundary_peak_load",
    "跨行业高峰负载边界",
    "One hundred eighty orders concentrate in six due-date windows and saturate alternate lines, setup families and finite substitute materials",
    ["180 条需求", "同窗高峰", "精确产能饱和", "备用设备", "替代物料", "换型传播", "高优先级跨度"],
    {
      current: timestamp(0),
      solver: {
        constraints: 15, plantype: 1, lazyDelay: 30 * 60, minimumDelay: 60,
        rotateResources: true, iterationMax: 400, resourceIterationMax: 800,
      },
      items: uniqueItems(buffers), operations, buffers,
      setupMatrices: [{
        name: "peak family change", rules: [
          { priority: 1, from: "idle", to: "family-a|family-b", duration: 5 * 60, cost: 1 },
          { priority: 2, from: "family-a", to: "family-b", duration: 45 * 60, cost: 8 },
          { priority: 3, from: "family-b", to: "family-a", duration: 30 * 60, cost: 6 },
          { priority: 99, from: ".*", to: ".*", duration: 5 * 60, cost: 1 },
        ],
      }],
      resources: [
        { name: "peak line A", maximum: 10, maxearly: 30 * DAY, setupMatrix: "peak family change", setup: "idle", efficiency: 100 },
        { name: "peak line B", maximum: 8, maxearly: 30 * DAY, setupMatrix: "peak family change", setup: "idle", efficiency: 90 },
      ],
      skills: [], resourceSkills: [], loads, flows, demands,
    },
  );
}

function lotSplitBoundaryScenario() {
  const product = { item: "boundary lot item", make: "boundary lot make", delivery: "boundary lot ship" };
  const demandCases = [
    { code: "zero", quantity: 0, minShipment: 0 },
    { code: "epsilon-below", quantity: 0.0000005, minShipment: 0 },
    { code: "epsilon-above", quantity: 0.000002, minShipment: 0 },
    { code: "below-min", quantity: 3, minShipment: 0 },
    { code: "at-min", quantity: 4, minShipment: 0 },
    { code: "at-max", quantity: 7, minShipment: 0 },
    { code: "max-plus-one", quantity: 8, minShipment: 0 },
    { code: "three-splits", quantity: 20, minShipment: 7 },
    { code: "min-above-max", quantity: 20, minShipment: 8 },
    { code: "fractional", quantity: 9.75, minShipment: 0.25 },
  ];
  return scenario(
    "boundary_lot_split",
    "批量与拆单临界边界",
    "Demand quantities cross rounding error, minimum and maximum lot sizes while explicit minimum shipments force accepted and rejected split deliveries",
    ["零需求", "舍入误差上下界", "最小批量", "最大批量", "多次拆单", "最小发运等于/大于单批上限", "小数数量"],
    {
      current: timestamp(0),
      solver: {
        constraints: 15, plantype: 1, lazyDelay: HOUR, minimumDelay: 1,
        rotateResources: false, iterationMax: 64, resourceIterationMax: 64,
      },
      items: [{ name: product.item }],
      operations: [
        { name: product.make, type: "fixed_time", duration: HOUR, sizeMinimum: 4, sizeMaximum: 7, cost: 1 },
        { name: product.delivery, type: "fixed_time", duration: 1, sizeMaximum: 7, cost: 1 },
      ],
      buffers: [{ name: product.item, item: product.item, producing: product.make, onhand: 200 }],
      setupMatrices: [], resources: [], skills: [], resourceSkills: [], loads: [],
      flows: [{ type: "start", operation: product.delivery, buffer: product.item, quantity: -1 }],
      demands: demandCases.map((entry, index) => ({
        name: `lot boundary ${String(index + 1).padStart(2, "0")} ${entry.code}`,
        item: product.item,
        operation: product.delivery,
        quantity: entry.quantity,
        due: timestamp(5 + index, 12),
        priority: index + 1,
        minShipment: entry.minShipment,
        maxLateness: index === 2 ? 1 : 3 * DAY,
        batch: index % 2 ? "lot-b" : "lot-a",
      })),
    },
  );
}

function timeCapacityBoundaryScenario() {
  const products = [
    { code: "ZERO", item: "zero duration item", duration: 0 },
    { code: "ONESEC", item: "one second item", duration: 1 },
    { code: "HOUR", item: "one hour item", duration: HOUR },
    { code: "LONG", item: "long horizon item", duration: 180 * DAY },
  ].map((product) => ({ ...product, make: `time make ${product.code}`, delivery: `time ship ${product.code}` }));
  const operations = products.flatMap((product) => [
    { name: product.make, type: "fixed_time", duration: product.duration, sizeMinimum: 1, sizeMaximum: 2, cost: 1 },
    { name: product.delivery, type: "fixed_time", duration: product.duration ? 1 : 0, sizeMaximum: 2, cost: 1 },
  ]);
  const buffers = products.map((product) => ({ name: product.item, item: product.item, producing: product.make, onhand: 0 }));
  const loads = products.map((product) => ({ operation: product.make, resource: "time boundary resource", quantity: 0.5 }));
  const flows = products.flatMap((product) => [
    { type: "start", operation: product.delivery, buffer: product.item, quantity: -1 },
    { type: "end", operation: product.make, buffer: product.item, quantity: 1 },
  ]);
  const dueDates = [
    timestamp(0),
    "2026-01-01T00:00:01",
    timestamp(1),
    "2030-12-30T23:59:59",
  ];
  return scenario(
    "boundary_time_capacity",
    "时间与产能临界边界",
    "Zero-second, one-second, exact-current and near-infinite-future dates share a half-unit load on a unit-capacity resource",
    ["零工时", "一秒工时", "当前时刻", "产能精确等于上限", "零最大延期", "2030 日期上限", "超长工艺"],
    {
      current: timestamp(0),
      solver: {
        constraints: 15, plantype: 1, lazyDelay: 1, minimumDelay: 0,
        administrativeLeadTime: 0, rotateResources: false,
        iterationMax: 32, resourceIterationMax: 256,
      },
      items: uniqueItems(buffers), operations, buffers,
      setupMatrices: [],
      resources: [{ name: "time boundary resource", maximum: 1, maxearly: 3650 * DAY, efficiency: 100 }],
      skills: [], resourceSkills: [], loads, flows,
      demands: products.flatMap((product, productIndex) => Array.from({ length: 3 }, (_, index) => ({
        name: `time boundary ${product.code} ${index + 1}`,
        item: product.item,
        operation: product.delivery,
        quantity: index === 2 ? 2 : 1,
        due: dueDates[productIndex],
        priority: productIndex * 3 + index + 1,
        minShipment: index === 2 ? 1 : 0,
        maxLateness: index === 0 ? 0 : index === 1 ? 1 : DAY,
      }))),
    },
  );
}

function unconstrainedBoundaryScenario() {
  const products = ["zero-stock", "zero-capacity", "huge-quantity"].map((code) => ({
    code, item: `unconstrained ${code}`, make: `unconstrained make ${code}`, delivery: `unconstrained ship ${code}`,
  }));
  const operations = products.flatMap((product, index) => [
    { name: product.make, type: "fixed_time", duration: (index + 1) * HOUR, sizeMinimum: 1, sizeMaximum: 1000, cost: 1 },
    { name: product.delivery, type: "fixed_time", duration: 1, sizeMaximum: 1000, cost: 1 },
  ]);
  const buffers = [
    { name: "unconstrained raw", item: "unconstrained raw", onhand: 0 },
    ...products.map((product) => ({ name: product.item, item: product.item, producing: product.make, onhand: 0 })),
  ];
  return scenario(
    "boundary_unconstrained",
    "无约束极值边界",
    "A constraints-zero run must plan through zero material and zero capacity, including a large quantity and closed or canceled demands",
    ["constraints=0", "零库存", "零产能", "大数量", "closed/canceled 过滤", "quote 排序", "无约束单扫"],
    {
      current: timestamp(0),
      solver: {
        constraints: 0, plantype: 1, lazyDelay: 1, minimumDelay: 0,
        rotateResources: true, iterationMax: 8, resourceIterationMax: 1,
      },
      items: uniqueItems(buffers), operations, buffers,
      setupMatrices: [],
      resources: [{ name: "unconstrained zero resource", maximum: 0, maxearly: 0, efficiency: 100 }],
      skills: [], resourceSkills: [],
      loads: products.map((product) => ({ operation: product.make, resource: "unconstrained zero resource", quantity: 1 })),
      flows: products.flatMap((product) => [
        { type: "start", operation: product.delivery, buffer: product.item, quantity: -1 },
        { type: "end", operation: product.make, buffer: product.item, quantity: 1 },
        { type: "start", operation: product.make, buffer: "unconstrained raw", quantity: -1 },
      ]),
      demands: [
        { name: "unconstrained open", item: products[0].item, operation: products[0].delivery, quantity: 1, due: timestamp(2), priority: 1, status: "open", maxLateness: 0 },
        { name: "unconstrained quote", item: products[1].item, operation: products[1].delivery, quantity: 2, due: timestamp(2), priority: 1, status: "quote", maxLateness: 0 },
        { name: "unconstrained huge", item: products[2].item, operation: products[2].delivery, quantity: 999.999, due: timestamp(3), priority: 2, status: "open", maxLateness: 0 },
        { name: "unconstrained closed", item: products[0].item, operation: products[0].delivery, quantity: 5, due: timestamp(1), priority: 0, status: "closed" },
        { name: "unconstrained canceled", item: products[1].item, operation: products[1].delivery, quantity: 5, due: timestamp(1), priority: 0, status: "canceled" },
      ],
    },
  );
}

function solverModesBoundaryScenario() {
  const product = { item: "solver modes item", make: "solver modes make", delivery: "solver modes ship" };
  return scenario(
    "boundary_solver_modes",
    "求解参数模式边界",
    "Heuristic two, plan type three and tight iteration controls are combined with exact capacity and material availability",
    ["algorithm=heuristic_2", "plantype=3", "iterationMax", "resourceIterationMax", "迭代精度边界", "精确物料", "精确产能"],
    {
      current: timestamp(0),
      solver: {
        constraints: 15, plantype: 3, algorithm: "heuristic_2", lazyDelay: 60,
        minimumDelay: 0, rotateResources: true, iterationMax: 16,
        resourceIterationMax: 16, iterationThreshold: 0, iterationAccuracy: 100,
      },
      items: [{ name: product.item }, { name: "solver modes raw" }],
      operations: [
        { name: product.make, type: "fixed_time", duration: HOUR, sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 5, cost: 1 },
        { name: product.delivery, type: "fixed_time", duration: 1, sizeMaximum: 5, cost: 1 },
      ],
      buffers: [
        { name: "solver modes raw", item: "solver modes raw", onhand: 25 },
        { name: product.item, item: product.item, producing: product.make, onhand: 0 },
      ],
      setupMatrices: [],
      resources: [{ name: "solver modes resource", maximum: 5, maxearly: 10 * DAY, efficiency: 100 }],
      skills: [], resourceSkills: [],
      loads: [{ operation: product.make, resource: "solver modes resource", quantity: 1 }],
      flows: [
        { type: "start", operation: product.delivery, buffer: product.item, quantity: -1 },
        { type: "end", operation: product.make, buffer: product.item, quantity: 1 },
        { type: "start", operation: product.make, buffer: "solver modes raw", quantity: -1 },
      ],
      demands: Array.from({ length: 12 }, (_, index) => ({
        name: `solver modes order ${String(index + 1).padStart(2, "0")}`,
        item: product.item,
        operation: product.delivery,
        quantity: (index % 5) + 1,
        due: timestamp(7 + Math.floor(index / 4), (index % 4) * 6),
        priority: (index % 4) + 1,
        minShipment: index % 3,
        maxLateness: index % 2 ? HOUR : 0,
      })),
    },
  );
}

function operationSplitRatioScenario() {
  const due = timestamp(20);
  return scenario(
    "operation_split_ratio",
    "流程工业分流",
    "A split operation distributes finished quantity over effective child operations in a 30/70 ratio",
    ["operation_split", "比例分流", "子操作产出系数", "子操作生效期"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: DAY },
      items: [{ name: "split finished" }],
      operations: [
        {
          name: "split make", type: "split",
          suboperations: [
            { operation: "split lane A", priority: 30 },
            { operation: "split lane B", priority: 70 },
            { operation: "split lane future", priority: 50, effectiveStart: timestamp(30) },
          ],
        },
        {
          name: "split lane A", type: "fixed_time", duration: 2 * DAY,
          sizeMinimum: 0, sizeMultiple: 0.5, sizeMaximum: 100, cost: 12,
        },
        {
          name: "split lane B", type: "fixed_time", duration: 3 * DAY,
          sizeMinimum: 0, sizeMultiple: 1, sizeMaximum: 100, cost: 8,
        },
        {
          name: "split lane future", type: "fixed_time", duration: DAY,
          sizeMinimum: 0, sizeMaximum: 100, cost: 4,
        },
        { name: "split ship", type: "fixed_time", duration: HOUR, cost: 1 },
      ],
      buffers: [
        { name: "split finished", item: "split finished", producing: "split make", onhand: 0 },
      ],
      resources: [],
      loads: [],
      flows: [
        { type: "end", operation: "split lane A", buffer: "split finished", quantity: 2 },
        { type: "end", operation: "split lane B", buffer: "split finished", quantity: 1 },
        { type: "end", operation: "split lane future", buffer: "split finished", quantity: 1 },
        { type: "start", operation: "split ship", buffer: "split finished", quantity: -1 },
      ],
      demands: [
        {
          name: "split order", item: "split finished", operation: "split ship",
          quantity: 10, due, priority: 1,
        },
      ],
    },
  );
}

function dependencyHardSoftLeadtimeScenario() {
  const due = timestamp(24);
  return scenario(
    "dependency_hard_soft_leadtime",
    "项目制造",
    "A successor operation recursively creates its predecessor with soft and hard safety lead times",
    ["operation_dependency", "soft leadtime", "hard leadtime", "递归前置工序"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: DAY },
      items: [{ name: "dependency project" }],
      operations: [
        { name: "dependency predecessor", type: "fixed_time", duration: 3 * DAY, cost: 7 },
        { name: "dependency successor", type: "fixed_time", duration: 2 * DAY, cost: 11 },
        { name: "dependency ship", type: "fixed_time", duration: HOUR, cost: 1 },
      ],
      dependencies: [
        {
          operation: "dependency successor", blockedBy: "dependency predecessor",
          quantity: 1, safetyLeadtime: 5 * DAY, hardSafetyLeadtime: 2 * DAY,
        },
      ],
      buffers: [
        { name: "dependency project", item: "dependency project", producing: "dependency successor", onhand: 0 },
      ],
      resources: [], loads: [],
      flows: [
        { type: "end", operation: "dependency successor", buffer: "dependency project", quantity: 1 },
        { type: "start", operation: "dependency ship", buffer: "dependency project", quantity: -1 },
      ],
      demands: [
        {
          name: "dependency order", item: "dependency project", operation: "dependency ship",
          quantity: 6, due, priority: 1,
        },
      ],
    },
  );
}

function demandGroupAllTogetherScenario() {
  return scenario(
    "demand_group_alltogether",
    "成套交付",
    "Two order lines must be delivered together; one constrained long-lead component forces rollback and synchronized replanning",
    ["demand_group", "alltogether", "整组回滚", "统一延期", "完整数量"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: DAY, minimumDelay: HOUR },
      items: [
        { name: "group ready item" },
        { name: "group long lead item" },
      ],
      operations: [
        { name: "group make long lead", type: "fixed_time", duration: 5 * DAY, cost: 20 },
        { name: "group ship ready", type: "fixed_time", duration: HOUR, cost: 1 },
        { name: "group ship long lead", type: "fixed_time", duration: HOUR, cost: 1 },
      ],
      buffers: [
        { name: "group ready item", item: "group ready item", onhand: 10 },
        { name: "group long lead item", item: "group long lead item", producing: "group make long lead", onhand: 0 },
      ],
      resources: [], loads: [],
      flows: [
        { type: "start", operation: "group ship ready", buffer: "group ready item", quantity: -1 },
        { type: "end", operation: "group make long lead", buffer: "group long lead item", quantity: 1 },
        { type: "start", operation: "group ship long lead", buffer: "group long lead item", quantity: -1 },
      ],
      demandGroups: [{
        name: "alltogether order", policy: "alltogether", status: "open",
        members: ["alltogether ready line", "alltogether long lead line"],
      }],
      demands: [
        {
          name: "alltogether ready line", group: "alltogether order",
          item: "group ready item", operation: "group ship ready",
          quantity: 6, due: timestamp(2), priority: 1, maxLateness: 20 * DAY,
        },
        {
          name: "alltogether long lead line", group: "alltogether order",
          item: "group long lead item", operation: "group ship long lead",
          quantity: 6, due: timestamp(3), priority: 1, maxLateness: 20 * DAY,
        },
      ],
    },
  );
}

function demandGroupInRatioScenario() {
  return scenario(
    "demand_group_inratio",
    "配套比例订单",
    "Three group lines follow the native in-ratio policy, sharing the earliest group date and stopping after one member pass",
    ["demand_group", "inratio", "组最早日期", "单轮求解", "不同成员数量"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: DAY },
      items: [
        { name: "ratio item A" }, { name: "ratio item B" }, { name: "ratio item C" },
      ],
      operations: [
        { name: "ratio ship A", type: "fixed_time", duration: HOUR, cost: 1 },
        { name: "ratio ship B", type: "fixed_time", duration: HOUR, cost: 1 },
        { name: "ratio ship C", type: "fixed_time", duration: HOUR, cost: 1 },
      ],
      buffers: [
        { name: "ratio item A", item: "ratio item A", onhand: 20 },
        { name: "ratio item B", item: "ratio item B", onhand: 20 },
        { name: "ratio item C", item: "ratio item C", onhand: 20 },
      ],
      resources: [], loads: [],
      flows: [
        { type: "start", operation: "ratio ship A", buffer: "ratio item A", quantity: -1 },
        { type: "start", operation: "ratio ship B", buffer: "ratio item B", quantity: -1 },
        { type: "start", operation: "ratio ship C", buffer: "ratio item C", quantity: -1 },
      ],
      demandGroups: [{
        name: "inratio order", policy: "inratio", status: "open",
        members: ["inratio line A", "inratio line B", "inratio line C"],
      }],
      demands: [
        { name: "inratio line A", group: "inratio order", item: "ratio item A", operation: "ratio ship A", quantity: 3, due: timestamp(5), priority: 1 },
        { name: "inratio line B", group: "inratio order", item: "ratio item B", operation: "ratio ship B", quantity: 6, due: timestamp(6), priority: 1 },
        { name: "inratio line C", group: "inratio order", item: "ratio item C", operation: "ratio ship C", quantity: 9, due: timestamp(7), priority: 1 },
      ],
    },
  );
}

function purchaseSupplierEffectivityScenario() {
  return scenario(
    "purchase_supplier_effectivity",
    "多供应商采购",
    "Two supplier lanes with non-overlapping effectivity windows automatically create purchase replenishments",
    ["自动采购操作", "供应商生效期", "采购提前期", "最小/倍增采购量", "采购硬安全提前期"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 6 * HOUR, minimumDelay: HOUR },
      locations: [
        { name: "purchase plant" },
        { name: "legacy supplier" },
        { name: "active supplier" },
      ],
      suppliers: [{ name: "legacy supplier" }, { name: "active supplier" }],
      items: [{ name: "purchased alloy" }],
      itemSuppliers: [
        {
          item: "purchased alloy", supplier: "legacy supplier", location: "purchase plant",
          priority: 1, leadtime: 2 * DAY, hardSafetyLeadtime: 6 * HOUR,
          sizeMinimum: 2, sizeMultiple: 2, sizeMaximum: 20, cost: 8,
          effectiveEnd: timestamp(-1),
        },
        {
          item: "purchased alloy", supplier: "active supplier", location: "purchase plant",
          priority: 2, leadtime: 4 * DAY, hardSafetyLeadtime: 12 * HOUR,
          sizeMinimum: 3, sizeMultiple: 3, sizeMaximum: 18, cost: 6,
          effectiveStart: timestamp(0), effectiveEnd: timestamp(90),
        },
      ],
      itemDistributions: [],
      operations: [{ name: "consume purchased alloy", type: "fixed_time", duration: HOUR, cost: 1 }],
      buffers: [{ name: "purchased alloy @ purchase plant", item: "purchased alloy", location: "purchase plant", onhand: 0 }],
      setupMatrices: [], resources: [], skills: [], resourceSkills: [], loads: [],
      flows: [{ type: "start", operation: "consume purchased alloy", buffer: "purchased alloy @ purchase plant", quantity: -1 }],
      demands: [
        { name: "purchase effectivity order 1", item: "purchased alloy", location: "purchase plant", operation: "consume purchased alloy", quantity: 7, due: timestamp(15), priority: 1 },
        { name: "purchase effectivity order 2", item: "purchased alloy", location: "purchase plant", operation: "consume purchased alloy", quantity: 5, due: timestamp(18), priority: 2 },
      ],
    },
  );
}

function purchaseResourceCapacityScenario() {
  return scenario(
    "purchase_resource_capacity",
    "受限采购收货",
    "Automatically generated purchase operations load a finite receiving resource and serialize inbound orders",
    ["采购自动 flow/load", "采购资源数量", "收货产能约束", "采购拆批", "多需求优先级"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 3 * HOUR, minimumDelay: HOUR },
      locations: [{ name: "receiving plant" }, { name: "capacity supplier" }],
      suppliers: [{ name: "capacity supplier" }],
      items: [{ name: "capacity constrained component" }],
      itemSuppliers: [{
        item: "capacity constrained component", supplier: "capacity supplier", location: "receiving plant",
        resource: "inbound dock", resourceQuantity: 1, priority: 1,
        leadtime: 2 * DAY, sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 4, cost: 4,
      }],
      itemDistributions: [],
      operations: [{ name: "issue constrained component", type: "fixed_time", duration: HOUR, cost: 1 }],
      buffers: [{ name: "capacity constrained component @ receiving plant", item: "capacity constrained component", location: "receiving plant", onhand: 0 }],
      setupMatrices: [],
      resources: [{ name: "inbound dock", maximum: 1, maxearly: 40 * DAY, efficiency: 100 }],
      skills: [], resourceSkills: [], loads: [],
      flows: [{ type: "start", operation: "issue constrained component", buffer: "capacity constrained component @ receiving plant", quantity: -1 }],
      demands: Array.from({ length: 5 }, (_, index) => ({
        name: `capacity purchase order ${index + 1}`,
        item: "capacity constrained component", location: "receiving plant", operation: "issue constrained component",
        quantity: 3, due: timestamp(12, index * 2), priority: index + 1,
      })),
    },
  );
}

function distributionMultilocationScenario() {
  return scenario(
    "distribution_multilocation",
    "多级配送网络",
    "Automatic distribution operations replenish two local sites through a regional hub from central inventory",
    ["自动配送操作", "多地点库存", "两级配送", "配送提前期", "共享上游库存", "配送订单类型"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 6 * HOUR, minimumDelay: HOUR },
      locations: [
        { name: "central warehouse" }, { name: "regional hub" },
        { name: "local east" }, { name: "local west" },
      ],
      suppliers: [],
      items: [{ name: "network product" }],
      itemSuppliers: [],
      itemDistributions: [
        { item: "network product", origin: "central warehouse", destination: "regional hub", priority: 1, leadtime: 2 * DAY, sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 50, cost: 2 },
        { item: "network product", origin: "regional hub", destination: "local east", priority: 1, leadtime: DAY, sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 20, cost: 1 },
        { item: "network product", origin: "regional hub", destination: "local west", priority: 1, leadtime: 36 * HOUR, sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 20, cost: 1.5 },
      ],
      operations: [
        { name: "ship east demand", type: "fixed_time", duration: HOUR, cost: 1 },
        { name: "ship west demand", type: "fixed_time", duration: HOUR, cost: 1 },
      ],
      buffers: [
        { name: "network product @ central warehouse", item: "network product", location: "central warehouse", onhand: 40 },
        { name: "network product @ regional hub", item: "network product", location: "regional hub", onhand: 2 },
        { name: "network product @ local east", item: "network product", location: "local east", onhand: 0 },
        { name: "network product @ local west", item: "network product", location: "local west", onhand: 0 },
      ],
      setupMatrices: [], resources: [], skills: [], resourceSkills: [], loads: [],
      flows: [
        { type: "start", operation: "ship east demand", buffer: "network product @ local east", quantity: -1 },
        { type: "start", operation: "ship west demand", buffer: "network product @ local west", quantity: -1 },
      ],
      demands: [
        { name: "east network order 1", item: "network product", location: "local east", operation: "ship east demand", quantity: 8, due: timestamp(10), priority: 1 },
        { name: "west network order 1", item: "network product", location: "local west", operation: "ship west demand", quantity: 11, due: timestamp(11), priority: 2 },
        { name: "east network order 2", item: "network product", location: "local east", operation: "ship east demand", quantity: 7, due: timestamp(13), priority: 3 },
      ],
    },
  );
}

function calendarShiftShutdownScenario() {
  return scenario(
    "calendar_shift_shutdown",
    "离散制造班次",
    "Operation, location and resource calendars combine weekday shifts, a lunch interruption and a plant shutdown",
    ["工作日班次", "午休", "工厂停产", "工序日历", "地点日历", "资源日历"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 4 * HOUR, minimumDelay: HOUR },
      calendars: [
        {
          name: "plant working calendar", default: 0,
          buckets: [
            { start: timestamp(0), end: timestamp(60), value: 1, priority: 10, days: 62, startTime: 8 * HOUR, endTime: 18 * HOUR },
            { start: timestamp(0), end: timestamp(60), value: 0, priority: 5, days: 62, startTime: 12 * HOUR, endTime: 13 * HOUR },
            { start: timestamp(13), end: timestamp(16), value: 0, priority: 1 },
          ],
        },
        {
          name: "operation second shift", default: 0,
          buckets: [
            { start: timestamp(0), end: timestamp(60), value: 1, priority: 10, days: 62, startTime: 9 * HOUR, endTime: 17 * HOUR },
          ],
        },
        {
          name: "machine maintenance", default: 1,
          buckets: [
            { start: timestamp(8, 10), end: timestamp(8, 15), value: 0, priority: 1 },
            { start: timestamp(19), end: timestamp(20, 12), value: 0, priority: 1 },
          ],
        },
      ],
      locations: [{ name: "shift plant", available: "plant working calendar" }],
      items: [{ name: "shift product" }],
      operations: [
        {
          name: "make shift product", type: "fixed_time", duration: 22 * HOUR,
          location: "shift plant", available: "operation second shift", cost: 9,
        },
        { name: "ship shift product", type: "fixed_time", duration: HOUR, location: "shift plant", cost: 1 },
      ],
      buffers: [{ name: "shift product @ shift plant", item: "shift product", location: "shift plant", producing: "make shift product", onhand: 0 }],
      resources: [{
        name: "shift machine", type: "default", location: "shift plant", available: "machine maintenance",
        maximum: 1, maxearly: 40 * DAY, efficiency: 100,
      }],
      loads: [{ operation: "make shift product", resource: "shift machine", quantity: 1 }],
      flows: [
        { type: "end", operation: "make shift product", buffer: "shift product @ shift plant", quantity: 1 },
        { type: "start", operation: "ship shift product", buffer: "shift product @ shift plant", quantity: -1 },
      ],
      demands: [
        { name: "shift order before shutdown", item: "shift product", location: "shift plant", operation: "ship shift product", quantity: 1, due: timestamp(12, 16), priority: 1 },
        { name: "shift order across shutdown", item: "shift product", location: "shift plant", operation: "ship shift product", quantity: 1, due: timestamp(17, 10), priority: 2 },
        { name: "shift order maintenance", item: "shift product", location: "shift plant", operation: "ship shift product", quantity: 1, due: timestamp(22, 9), priority: 3 },
      ],
    },
  );
}

function calendarDstOverlapScenario() {
  return scenario(
    "calendar_dst_overlap",
    "跨时区连续生产",
    "Weekly working windows cross both US daylight-saving transitions and an overlapping high-priority outage",
    ["DST 春季跳时", "DST 秋季重叠", "周历", "优先级覆盖", "跨日历工时"],
    {
      current: "2026-03-01T00:00:00",
      solver: { constraints: 15, plantype: 1, lazyDelay: HOUR, minimumDelay: 30 * 60 },
      calendars: [{
        name: "dst working calendar", default: 0,
        buckets: [
          { start: "2026-03-01T00:00:00", end: "2026-11-08T00:00:00", value: 1, priority: 10, days: 127, startTime: HOUR, endTime: 5 * HOUR },
          { start: "2026-03-08T03:00:00", end: "2026-03-08T04:00:00", value: 0, priority: 1 },
          { start: "2026-11-01T01:00:00", end: "2026-11-01T02:30:00", value: 0, priority: 1 },
        ],
      }],
      locations: [{ name: "dst plant", available: "dst working calendar" }],
      items: [{ name: "dst product" }],
      operations: [
        { name: "make dst product", type: "fixed_time", duration: 7 * HOUR, location: "dst plant", cost: 3 },
        { name: "ship dst product", type: "fixed_time", duration: 30 * 60, location: "dst plant", cost: 1 },
      ],
      buffers: [{ name: "dst product @ dst plant", item: "dst product", location: "dst plant", producing: "make dst product", onhand: 0 }],
      resources: [], loads: [],
      flows: [
        { type: "end", operation: "make dst product", buffer: "dst product @ dst plant", quantity: 1 },
        { type: "start", operation: "ship dst product", buffer: "dst product @ dst plant", quantity: -1 },
      ],
      demands: [
        { name: "dst spring order", item: "dst product", location: "dst plant", operation: "ship dst product", quantity: 1, due: "2026-03-09T05:00:00", priority: 1 },
        { name: "dst fall order", item: "dst product", location: "dst plant", operation: "ship dst product", quantity: 1, due: "2026-11-02T05:00:00", priority: 2 },
      ],
    },
  );
}

function bucketizedCapacityScenario() {
  return scenario(
    "bucketized_capacity",
    "按日配额生产",
    "A bucketized resource with varying daily quotas must split, move early and move late across zero-capacity buckets",
    ["桶化资源", "变动日配额", "零产能桶", "部分数量", "提前桶", "延期桶"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 2 * HOUR, minimumDelay: HOUR, resourceIterationMax: 500 },
      calendars: [{
        name: "daily quota", default: 0,
        buckets: [
          { start: timestamp(0), end: timestamp(5), value: 6, priority: 1 },
          { start: timestamp(5), end: timestamp(8), value: 0, priority: 1 },
          { start: timestamp(8), end: timestamp(14), value: 4, priority: 1 },
          { start: timestamp(14), end: timestamp(22), value: 8, priority: 1 },
          { start: timestamp(22), end: timestamp(35), value: 3, priority: 1 },
        ],
      }],
      locations: [{ name: "quota plant" }],
      items: [{ name: "quota product" }],
      operations: [
        { name: "make quota product", type: "fixed_time", duration: 2 * HOUR, location: "quota plant", sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 20, cost: 2 },
        { name: "ship quota product", type: "fixed_time", duration: HOUR, location: "quota plant", cost: 1 },
      ],
      buffers: [{ name: "quota product @ quota plant", item: "quota product", location: "quota plant", producing: "make quota product", onhand: 0 }],
      resources: [{ name: "quota resource", type: "buckets", location: "quota plant", maximumCalendar: "daily quota", maximum: 0, maxearly: 20 * DAY, efficiency: 100 }],
      loads: [{ operation: "make quota product", resource: "quota resource", quantity: 1 }],
      flows: [
        { type: "end", operation: "make quota product", buffer: "quota product @ quota plant", quantity: 1 },
        { type: "start", operation: "ship quota product", buffer: "quota product @ quota plant", quantity: -1 },
      ],
      demands: [
        { name: "quota order A", item: "quota product", location: "quota plant", operation: "ship quota product", quantity: 11, due: timestamp(12), priority: 1, minShipment: 1 },
        { name: "quota order B", item: "quota product", location: "quota plant", operation: "ship quota product", quantity: 10, due: timestamp(15), priority: 2, minShipment: 1 },
        { name: "quota order C", item: "quota product", location: "quota plant", operation: "ship quota product", quantity: 7, due: timestamp(23), priority: 3, minShipment: 1 },
      ],
    },
  );
}

function bucketizedPercentageLoadScenario() {
  return scenario(
    "bucketized_percentage_load",
    "项目里程碑配额",
    "Time-per operations consume bucket quotas at percentage, from-start and from-end milestones",
    ["operation_time_per", "百分比负荷", "从开始偏移", "从结束偏移", "桶内压缩", "跨桶移动"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 2 * HOUR, minimumDelay: HOUR, resourceIterationMax: 500 },
      calendars: [{
        name: "milestone quota", default: 0,
        buckets: [
          { start: timestamp(0), end: timestamp(8), value: 12, priority: 1 },
          { start: timestamp(8), end: timestamp(16), value: 7, priority: 1 },
          { start: timestamp(16), end: timestamp(24), value: 18, priority: 1 },
          { start: timestamp(24), end: timestamp(40), value: 9, priority: 1 },
        ],
      }],
      locations: [{ name: "milestone plant" }],
      items: [{ name: "milestone product A" }, { name: "milestone product B" }, { name: "milestone product C" }],
      operations: [
        { name: "make milestone A", type: "time_per", duration: DAY, durationPer: 4 * HOUR, location: "milestone plant", sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 20, cost: 3 },
        { name: "make milestone B", type: "time_per", duration: 12 * HOUR, durationPer: 3 * HOUR, location: "milestone plant", sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 20, cost: 3 },
        { name: "make milestone C", type: "time_per", duration: 18 * HOUR, durationPer: 2 * HOUR, location: "milestone plant", sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 20, cost: 3 },
        { name: "ship milestone A", type: "fixed_time", duration: HOUR, location: "milestone plant" },
        { name: "ship milestone B", type: "fixed_time", duration: HOUR, location: "milestone plant" },
        { name: "ship milestone C", type: "fixed_time", duration: HOUR, location: "milestone plant" },
      ],
      buffers: [
        { name: "milestone product A @ plant", item: "milestone product A", location: "milestone plant", producing: "make milestone A", onhand: 0 },
        { name: "milestone product B @ plant", item: "milestone product B", location: "milestone plant", producing: "make milestone B", onhand: 0 },
        { name: "milestone product C @ plant", item: "milestone product C", location: "milestone plant", producing: "make milestone C", onhand: 0 },
      ],
      resources: [{ name: "milestone resource", type: "buckets", location: "milestone plant", maximumCalendar: "milestone quota", maximum: 0, maxearly: 30 * DAY, efficiency: 100 }],
      loads: [
        { operation: "make milestone A", resource: "milestone resource", quantity: 2, type: "bucketized_percentage", offset: 50 },
        { operation: "make milestone B", resource: "milestone resource", quantity: 1, type: "bucketized_from_start", offset: DAY },
        { operation: "make milestone C", resource: "milestone resource", quantity: 1.5, type: "bucketized_from_end", offset: 12 * HOUR },
      ],
      flows: [
        { type: "end", operation: "make milestone A", buffer: "milestone product A @ plant", quantity: 1 },
        { type: "end", operation: "make milestone B", buffer: "milestone product B @ plant", quantity: 1 },
        { type: "end", operation: "make milestone C", buffer: "milestone product C @ plant", quantity: 1 },
        { type: "start", operation: "ship milestone A", buffer: "milestone product A @ plant", quantity: -1 },
        { type: "start", operation: "ship milestone B", buffer: "milestone product B @ plant", quantity: -1 },
        { type: "start", operation: "ship milestone C", buffer: "milestone product C @ plant", quantity: -1 },
      ],
      demands: [
        { name: "milestone order A1", item: "milestone product A", location: "milestone plant", operation: "ship milestone A", quantity: 8, due: timestamp(14), priority: 1, minShipment: 1 },
        { name: "milestone order B1", item: "milestone product B", location: "milestone plant", operation: "ship milestone B", quantity: 9, due: timestamp(17), priority: 2, minShipment: 1 },
        { name: "milestone order C1", item: "milestone product C", location: "milestone plant", operation: "ship milestone C", quantity: 10, due: timestamp(25), priority: 3, minShipment: 1 },
      ],
    },
  );
}

function transferBatchRoutingScenario() {
  return scenario(
    "transfer_batch_routing",
    "连续流程制造",
    "Transfer batches become available throughout a long upstream operation and feed a routed downstream process",
    ["transfer batch", "分批产出", "routing", "在制品衔接", "多批需求", "部分批次"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 2 * HOUR, minimumDelay: HOUR },
      locations: [{ name: "transfer plant" }],
      items: [
        { name: "transfer raw" }, { name: "transfer intermediate" }, { name: "transfer finished" },
      ],
      operations: [
        { name: "continuous upstream", type: "time_per", duration: 4 * HOUR, durationPer: 2 * HOUR, location: "transfer plant", sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 20, cost: 3 },
        { name: "transfer finish step", type: "fixed_time", duration: 5 * HOUR, location: "transfer plant", sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 20, cost: 4 },
        { name: "transfer pack step", type: "fixed_time", duration: 2 * HOUR, location: "transfer plant", sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 20, cost: 2 },
        {
          name: "transfer downstream routing", type: "routing", location: "transfer plant",
          suboperations: [
            { operation: "transfer finish step", priority: 1 },
            { operation: "transfer pack step", priority: 2 },
          ],
        },
        { name: "ship transfer finished", type: "fixed_time", duration: HOUR, location: "transfer plant" },
      ],
      buffers: [
        { name: "transfer raw @ transfer plant", item: "transfer raw", location: "transfer plant", onhand: 80 },
        { name: "transfer intermediate @ transfer plant", item: "transfer intermediate", location: "transfer plant", producing: "continuous upstream", onhand: 0 },
        { name: "transfer finished @ transfer plant", item: "transfer finished", location: "transfer plant", producing: "transfer downstream routing", onhand: 0 },
      ],
      resources: [
        { name: "transfer reactor", maximum: 1, maxearly: 40 * DAY, location: "transfer plant", efficiency: 100 },
        { name: "transfer finishing line", maximum: 2, maxearly: 40 * DAY, location: "transfer plant", efficiency: 100 },
      ],
      loads: [
        { operation: "continuous upstream", resource: "transfer reactor", quantity: 1 },
        { operation: "transfer finish step", resource: "transfer finishing line", quantity: 1 },
      ],
      flows: [
        { type: "start", operation: "continuous upstream", buffer: "transfer raw @ transfer plant", quantity: -1 },
        { type: "transfer_batch", operation: "continuous upstream", buffer: "transfer intermediate @ transfer plant", quantity: 1, transferBatch: 3 },
        { type: "start", operation: "transfer finish step", buffer: "transfer intermediate @ transfer plant", quantity: -1 },
        { type: "end", operation: "transfer pack step", buffer: "transfer finished @ transfer plant", quantity: 1 },
        { type: "start", operation: "ship transfer finished", buffer: "transfer finished @ transfer plant", quantity: -1 },
      ],
      demands: [
        { name: "transfer order A", item: "transfer finished", location: "transfer plant", operation: "ship transfer finished", quantity: 8, due: timestamp(12), priority: 1, minShipment: 1 },
        { name: "transfer order B", item: "transfer finished", location: "transfer plant", operation: "ship transfer finished", quantity: 7, due: timestamp(13, 12), priority: 2, minShipment: 1 },
        { name: "transfer order C", item: "transfer finished", location: "transfer plant", operation: "ship transfer finished", quantity: 5, due: timestamp(16), priority: 3, minShipment: 1 },
      ],
    },
  );
}

function mtoBatchIsolationScenario() {
  return scenario(
    "mto_batch_isolation",
    "按订单定制制造",
    "MTO supply and inventory remain isolated by demand batch even when item, operation and location are shared",
    ["ItemMTO", "batch buffer", "批次隔离", "共享工艺", "同日需求", "跨批不可借料"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 3 * HOUR, minimumDelay: HOUR },
      locations: [{ name: "mto plant" }],
      items: [{ name: "mto raw" }, { name: "custom assembly", type: "mto" }],
      operations: [
        { name: "make custom assembly", type: "time_per", item: "custom assembly", duration: 3 * HOUR, durationPer: HOUR, location: "mto plant", sizeMinimum: 2, sizeMultiple: 2, sizeMaximum: 12, cost: 8 },
        { name: "ship custom assembly", type: "fixed_time", duration: HOUR, location: "mto plant", cost: 1 },
      ],
      buffers: [
        { name: "mto raw @ mto plant", item: "mto raw", location: "mto plant", onhand: 60 },
        { name: "custom assembly @ mto plant", item: "custom assembly", location: "mto plant", producing: "make custom assembly", onhand: 0 },
      ],
      resources: [{ name: "mto cell", maximum: 1, maxearly: 30 * DAY, location: "mto plant", efficiency: 100 }],
      loads: [{ operation: "make custom assembly", resource: "mto cell", quantity: 1 }],
      flows: [
        { type: "start", operation: "make custom assembly", buffer: "mto raw @ mto plant", quantity: -1 },
        { type: "end", operation: "make custom assembly", buffer: "custom assembly @ mto plant", quantity: 1 },
        { type: "start", operation: "ship custom assembly", buffer: "custom assembly @ mto plant", quantity: -1 },
      ],
      demands: [
        { name: "mto order A1", item: "custom assembly", location: "mto plant", operation: "ship custom assembly", quantity: 5, due: timestamp(10), priority: 1, batch: "CONFIG-A", minShipment: 1 },
        { name: "mto order B1", item: "custom assembly", location: "mto plant", operation: "ship custom assembly", quantity: 5, due: timestamp(10), priority: 2, batch: "CONFIG-B", minShipment: 1 },
        { name: "mto order A2", item: "custom assembly", location: "mto plant", operation: "ship custom assembly", quantity: 3, due: timestamp(12), priority: 3, batch: "CONFIG-A", minShipment: 1 },
        { name: "mto order C1", item: "custom assembly", location: "mto plant", operation: "ship custom assembly", quantity: 7, due: timestamp(14), priority: 4, batch: "CONFIG-C", minShipment: 1 },
      ],
    },
  );
}

function alternateMinCostPenaltyScenario() {
  return scenario(
    "alternate_mincost_penalty",
    "外协与自制决策",
    "MINCOSTPENALTY evaluates a cheap constrained process against a costly fast process and replans the selected alternate",
    ["OperationAlternate", "MINCOSTPENALTY", "成本评估", "延期惩罚", "有限产能", "择优重排"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 4 * HOUR, minimumDelay: HOUR },
      locations: [{ name: "alternate plant" }],
      items: [{ name: "alternate raw" }, { name: "alternate cost product" }],
      operations: [
        { name: "cheap slow process", type: "fixed_time", duration: 2 * DAY, location: "alternate plant", sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 6, cost: 2 },
        { name: "costly fast process", type: "fixed_time", duration: 6 * HOUR, location: "alternate plant", sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 20, cost: 35 },
        {
          name: "choose alternate cost process", type: "alternate", search: "MINCOSTPENALTY", location: "alternate plant",
          suboperations: [
            { operation: "cheap slow process", priority: 1 },
            { operation: "costly fast process", priority: 2 },
          ],
        },
        { name: "ship alternate cost product", type: "fixed_time", duration: HOUR, location: "alternate plant" },
      ],
      buffers: [
        { name: "alternate raw @ alternate plant", item: "alternate raw", location: "alternate plant", onhand: 100 },
        { name: "alternate cost product @ alternate plant", item: "alternate cost product", location: "alternate plant", producing: "choose alternate cost process", onhand: 0 },
      ],
      resources: [
        { name: "cheap line", maximum: 1, maxearly: 2 * DAY, location: "alternate plant", efficiency: 100, cost: 1 },
        { name: "fast line", maximum: 2, maxearly: 20 * DAY, location: "alternate plant", efficiency: 100, cost: 8 },
      ],
      loads: [
        { operation: "cheap slow process", resource: "cheap line", quantity: 1 },
        { operation: "costly fast process", resource: "fast line", quantity: 1 },
      ],
      flows: [
        { type: "start", operation: "cheap slow process", buffer: "alternate raw @ alternate plant", quantity: -1 },
        { type: "end", operation: "cheap slow process", buffer: "alternate cost product @ alternate plant", quantity: 1 },
        { type: "start", operation: "costly fast process", buffer: "alternate raw @ alternate plant", quantity: -1 },
        { type: "end", operation: "costly fast process", buffer: "alternate cost product @ alternate plant", quantity: 1 },
        { type: "start", operation: "ship alternate cost product", buffer: "alternate cost product @ alternate plant", quantity: -1 },
      ],
      demands: [
        { name: "alternate cost order A", item: "alternate cost product", location: "alternate plant", operation: "ship alternate cost product", quantity: 9, due: timestamp(7), priority: 1, minShipment: 1 },
        { name: "alternate cost order B", item: "alternate cost product", location: "alternate plant", operation: "ship alternate cost product", quantity: 8, due: timestamp(8), priority: 2, minShipment: 1 },
        { name: "alternate cost order C", item: "alternate cost product", location: "alternate plant", operation: "ship alternate cost product", quantity: 4, due: timestamp(9), priority: 3, minShipment: 1 },
      ],
    },
  );
}

function timePerLotSizeScenario() {
  return scenario(
    "timeper_lot_size",
    "批量加工制造",
    "Time-per production combines fixed and variable duration with minimum, multiple, maximum and partial demand quantities",
    ["OperationTimePer", "固定+单位工时", "最小批量", "批量倍数", "最大批量", "超量库存"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 2 * HOUR, minimumDelay: HOUR },
      locations: [{ name: "lot plant" }],
      items: [{ name: "lot raw" }, { name: "lot product" }],
      operations: [
        { name: "make lot product", type: "time_per", duration: 5 * HOUR, durationPer: 90 * 60, location: "lot plant", sizeMinimum: 4, sizeMultiple: 3, sizeMaximum: 13, cost: 6 },
        { name: "ship lot product", type: "fixed_time", duration: HOUR, location: "lot plant", cost: 1 },
      ],
      buffers: [
        { name: "lot raw @ lot plant", item: "lot raw", location: "lot plant", onhand: 100 },
        { name: "lot product @ lot plant", item: "lot product", location: "lot plant", producing: "make lot product", onhand: 0 },
      ],
      resources: [{ name: "lot machine", maximum: 1, maxearly: 25 * DAY, location: "lot plant", efficiency: 80 }],
      loads: [{ operation: "make lot product", resource: "lot machine", quantity: 1 }],
      flows: [
        { type: "start", operation: "make lot product", buffer: "lot raw @ lot plant", quantity: -1 },
        { type: "end", operation: "make lot product", buffer: "lot product @ lot plant", quantity: 1 },
        { type: "start", operation: "ship lot product", buffer: "lot product @ lot plant", quantity: -1 },
      ],
      demands: [
        { name: "lot order below minimum", item: "lot product", location: "lot plant", operation: "ship lot product", quantity: 2, due: timestamp(8), priority: 1, minShipment: 1 },
        { name: "lot order between multiples", item: "lot product", location: "lot plant", operation: "ship lot product", quantity: 8, due: timestamp(10), priority: 2, minShipment: 1 },
        { name: "lot order above maximum", item: "lot product", location: "lot plant", operation: "ship lot product", quantity: 29, due: timestamp(13), priority: 3, minShipment: 1 },
        { name: "lot order exact multiple", item: "lot product", location: "lot plant", operation: "ship lot product", quantity: 12, due: timestamp(17), priority: 4, minShipment: 1 },
      ],
    },
  );
}

function confirmedApprovedOrdersScenario() {
  return scenario(
    "confirmed_approved_orders",
    "离散制造在制订单",
    "Confirmed and approved manufacturing orders coexist with new demand and remain available as locked supply",
    ["confirmed MO", "approved MO", "锁定供给", "资源占用", "补充计划", "多需求优先级"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 2 * HOUR, minimumDelay: HOUR },
      locations: [{ name: "locked order plant" }],
      items: [{ name: "locked raw" }, { name: "locked product" }],
      operations: [
        { name: "make locked product", type: "fixed_time", duration: 2 * DAY, location: "locked order plant", sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 10, cost: 7 },
        { name: "ship locked product", type: "fixed_time", duration: HOUR, location: "locked order plant", cost: 1 },
      ],
      buffers: [
        { name: "locked raw @ plant", item: "locked raw", location: "locked order plant", onhand: 80 },
        { name: "locked product @ plant", item: "locked product", location: "locked order plant", producing: "make locked product", onhand: 0 },
      ],
      resources: [{ name: "locked order machine", maximum: 1, maxearly: 30 * DAY, location: "locked order plant", efficiency: 100 }],
      loads: [{ operation: "make locked product", resource: "locked order machine", quantity: 1 }],
      flows: [
        { type: "start", operation: "make locked product", buffer: "locked raw @ plant", quantity: -1 },
        { type: "end", operation: "make locked product", buffer: "locked product @ plant", quantity: 1 },
        { type: "start", operation: "ship locked product", buffer: "locked product @ plant", quantity: -1 },
      ],
      operationPlans: [
        { reference: "MO-CONFIRMED-001", operation: "make locked product", quantity: 8, start: timestamp(2), end: timestamp(4), status: "confirmed", batch: "LOCKED-A" },
        { reference: "MO-APPROVED-001", operation: "make locked product", quantity: 6, start: timestamp(5), status: "approved", batch: "LOCKED-A" },
      ],
      demands: [
        { name: "locked order demand A", item: "locked product", location: "locked order plant", operation: "ship locked product", quantity: 12, due: timestamp(8), priority: 1, minShipment: 1, batch: "LOCKED-A" },
        { name: "locked order demand B", item: "locked product", location: "locked order plant", operation: "ship locked product", quantity: 9, due: timestamp(11), priority: 2, minShipment: 1, batch: "LOCKED-A" },
        { name: "locked order demand C", item: "locked product", location: "locked order plant", operation: "ship locked product", quantity: 5, due: timestamp(14), priority: 3, minShipment: 1, batch: "LOCKED-A" },
      ],
    },
  );
}

function partialCompletedOrderScenario() {
  return scenario(
    "partial_completed_order",
    "流程制造在制进度",
    "Partially completed time-per orders consume and produce only their remaining quantity while new supply fills the gap",
    ["quantity_completed", "confirmed WIP", "approved WIP", "剩余数量", "time-per", "流量缩放"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 2 * HOUR, minimumDelay: HOUR },
      locations: [{ name: "partial plant" }],
      items: [{ name: "partial raw" }, { name: "partial product" }],
      operations: [
        { name: "make partial product", type: "time_per", duration: 4 * HOUR, durationPer: HOUR, location: "partial plant", sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 20, cost: 9 },
        { name: "ship partial product", type: "fixed_time", duration: HOUR, location: "partial plant", cost: 1 },
      ],
      buffers: [
        { name: "partial raw @ plant", item: "partial raw", location: "partial plant", onhand: 80 },
        { name: "partial product @ plant", item: "partial product", location: "partial plant", producing: "make partial product", onhand: 0 },
      ],
      resources: [{ name: "partial machine", maximum: 1, maxearly: 25 * DAY, location: "partial plant", efficiency: 80 }],
      loads: [{ operation: "make partial product", resource: "partial machine", quantity: 1 }],
      flows: [
        { type: "start", operation: "make partial product", buffer: "partial raw @ plant", quantity: -1 },
        { type: "end", operation: "make partial product", buffer: "partial product @ plant", quantity: 1 },
        { type: "start", operation: "ship partial product", buffer: "partial product @ plant", quantity: -1 },
      ],
      operationPlans: [
        { reference: "WIP-CONFIRMED-001", operation: "make partial product", quantity: 12, quantityCompleted: 5, start: timestamp(1, 6), status: "confirmed", batch: "PARTIAL-A" },
        { reference: "WIP-APPROVED-001", operation: "make partial product", quantity: 10, quantityCompleted: 4, end: timestamp(5), status: "approved", batch: "PARTIAL-A" },
      ],
      demands: [
        { name: "partial demand A", item: "partial product", location: "partial plant", operation: "ship partial product", quantity: 9, due: timestamp(7), priority: 1, minShipment: 1, batch: "PARTIAL-A" },
        { name: "partial demand B", item: "partial product", location: "partial plant", operation: "ship partial product", quantity: 12, due: timestamp(10), priority: 2, minShipment: 1, batch: "PARTIAL-A" },
        { name: "partial demand C", item: "partial product", location: "partial plant", operation: "ship partial product", quantity: 8, due: timestamp(13), priority: 3, minShipment: 1, batch: "PARTIAL-A" },
      ],
    },
  );
}

function lockedSetupScenario() {
  return scenario(
    "locked_setup",
    "涂装换型生产",
    "A locked manufacturing order preserves its overridden setup duration while adjacent proposed orders follow setup-matrix rules",
    ["setup override", "confirmed setup", "setup matrix", "相邻换型", "初始 setup", "锁定日期"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: HOUR, minimumDelay: 30 * 60 },
      locations: [{ name: "setup plant" }],
      items: [{ name: "setup raw" }, { name: "red setup product" }, { name: "blue setup product" }],
      operations: [
        { name: "make red setup product", type: "fixed_time", duration: 8 * HOUR, location: "setup plant", sizeMinimum: 1, sizeMaximum: 10, cost: 5 },
        { name: "make blue setup product", type: "fixed_time", duration: 10 * HOUR, location: "setup plant", sizeMinimum: 1, sizeMaximum: 10, cost: 5 },
        { name: "ship red setup product", type: "fixed_time", duration: HOUR, location: "setup plant" },
        { name: "ship blue setup product", type: "fixed_time", duration: HOUR, location: "setup plant" },
      ],
      setupMatrices: [{
        name: "locked color matrix",
        rules: [
          { priority: 1, from: "idle", to: "red|blue", duration: 2 * HOUR, cost: 4 },
          { priority: 2, from: "red", to: "blue", duration: 5 * HOUR, cost: 12 },
          { priority: 3, from: "blue", to: "red", duration: 4 * HOUR, cost: 10 },
          { priority: 99, from: ".*", to: ".*", duration: HOUR, cost: 2 },
        ],
      }],
      buffers: [
        { name: "setup raw @ plant", item: "setup raw", location: "setup plant", onhand: 100 },
        { name: "red setup product @ plant", item: "red setup product", location: "setup plant", producing: "make red setup product", onhand: 0 },
        { name: "blue setup product @ plant", item: "blue setup product", location: "setup plant", producing: "make blue setup product", onhand: 0 },
      ],
      resources: [{ name: "locked setup line", maximum: 1, maxearly: 20 * DAY, location: "setup plant", efficiency: 100, setupMatrix: "locked color matrix", setup: "idle" }],
      loads: [
        { operation: "make red setup product", resource: "locked setup line", quantity: 1, setup: "red" },
        { operation: "make blue setup product", resource: "locked setup line", quantity: 1, setup: "blue" },
      ],
      flows: [
        { type: "start", operation: "make red setup product", buffer: "setup raw @ plant", quantity: -1 },
        { type: "end", operation: "make red setup product", buffer: "red setup product @ plant", quantity: 1 },
        { type: "start", operation: "make blue setup product", buffer: "setup raw @ plant", quantity: -1 },
        { type: "end", operation: "make blue setup product", buffer: "blue setup product @ plant", quantity: 1 },
        { type: "start", operation: "ship red setup product", buffer: "red setup product @ plant", quantity: -1 },
        { type: "start", operation: "ship blue setup product", buffer: "blue setup product @ plant", quantity: -1 },
      ],
      operationPlans: [
        { reference: "MO-LOCKED-SETUP-001", operation: "make red setup product", quantity: 5, start: timestamp(2, 3), end: timestamp(2, 11), status: "confirmed", setupOverride: 3 * HOUR },
      ],
      demands: [
        { name: "locked setup red demand", item: "red setup product", location: "setup plant", operation: "ship red setup product", quantity: 8, due: timestamp(5), priority: 1, minShipment: 1 },
        { name: "locked setup blue demand", item: "blue setup product", location: "setup plant", operation: "ship blue setup product", quantity: 9, due: timestamp(6), priority: 2, minShipment: 1 },
        { name: "locked setup red followup", item: "red setup product", location: "setup plant", operation: "ship red setup product", quantity: 7, due: timestamp(8), priority: 3, minShipment: 1 },
      ],
    },
  );
}

function operationPlanDependencyScenario() {
  return scenario(
    "operationplan_dependency",
    "工程任务排产",
    "Static operation dependencies allocate concrete predecessor plans, including approved WIP, to newly planned successor orders",
    ["OperationPlanDependency", "approved predecessor", "依赖数量", "hard leadtime", "具体计划匹配", "补充前置任务"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: 2 * HOUR, minimumDelay: HOUR },
      locations: [{ name: "dependency project" }],
      items: [{ name: "dependency deliverable" }],
      operations: [
        { name: "dependency predecessor", type: "fixed_time", duration: DAY, location: "dependency project", sizeMinimum: 1, sizeMaximum: 20, cost: 4 },
        { name: "dependency successor", type: "fixed_time", duration: 2 * DAY, location: "dependency project", sizeMinimum: 1, sizeMaximum: 20, cost: 8 },
        { name: "ship dependency deliverable", type: "fixed_time", duration: HOUR, location: "dependency project" },
      ],
      dependencies: [
        { operation: "dependency successor", blockedBy: "dependency predecessor", quantity: 1.5, safetyLeadtime: 6 * HOUR, hardSafetyLeadtime: 12 * HOUR },
      ],
      buffers: [{ name: "dependency deliverable @ project", item: "dependency deliverable", location: "dependency project", producing: "dependency successor", onhand: 0 }],
      resources: [
        { name: "dependency predecessor team", maximum: 2, maxearly: 30 * DAY, location: "dependency project", efficiency: 100 },
        { name: "dependency successor team", maximum: 1, maxearly: 30 * DAY, location: "dependency project", efficiency: 100 },
      ],
      loads: [
        { operation: "dependency predecessor", resource: "dependency predecessor team", quantity: 1 },
        { operation: "dependency successor", resource: "dependency successor team", quantity: 1 },
      ],
      flows: [
        { type: "end", operation: "dependency successor", buffer: "dependency deliverable @ project", quantity: 1 },
        { type: "start", operation: "ship dependency deliverable", buffer: "dependency deliverable @ project", quantity: -1 },
      ],
      operationPlans: [
        { reference: "TASK-PREDECESSOR-WIP", operation: "dependency predecessor", quantity: 6, end: timestamp(5), status: "approved", batch: "PROJECT-A" },
      ],
      demands: [
        { name: "dependency project order A", item: "dependency deliverable", location: "dependency project", operation: "ship dependency deliverable", quantity: 7, due: timestamp(10), priority: 1, minShipment: 1, batch: "PROJECT-A" },
        { name: "dependency project order B", item: "dependency deliverable", location: "dependency project", operation: "ship dependency deliverable", quantity: 5, due: timestamp(14), priority: 2, minShipment: 1, batch: "PROJECT-A" },
      ],
    },
  );
}

function operationPlanCreationMergeScenario() {
  return scenario(
    "operationplan_creation_merge",
    "离散制造计划合并",
    "Equal-date fixed-time supply plans consolidate during creation below, but not exactly at, the strict maximum lot size",
    ["创建阶段合并", "严格 sizeMaximum", "全局合并开关独立", "同日期供给", "需求隔离"],
    {
      current: timestamp(0),
      plan: { allowMergingOperationPlans: false },
      solver: { constraints: 15, plantype: 1, lazyDelay: HOUR, minimumDelay: HOUR },
      locations: [{ name: "merge plant" }],
      items: [{ name: "merge product" }],
      operations: [
        { name: "make merge product", type: "fixed_time", duration: 6 * HOUR, location: "merge plant", sizeMinimum: 1, sizeMaximum: 10, cost: 4 },
        { name: "ship merge product", type: "fixed_time", duration: HOUR, location: "merge plant", cost: 1 },
      ],
      buffers: [
        { name: "merge product @ plant", item: "merge product", location: "merge plant", producing: "make merge product", onhand: 0 },
      ],
      resources: [], loads: [],
      flows: [
        { type: "end", operation: "make merge product", buffer: "merge product @ plant", quantity: 1 },
        { type: "start", operation: "ship merge product", buffer: "merge product @ plant", quantity: -1 },
      ],
      demands: [
        { name: "merge order A", item: "merge product", location: "merge plant", operation: "ship merge product", quantity: 3, due: timestamp(10), priority: 1, minShipment: 1 },
        { name: "merge order B", item: "merge product", location: "merge plant", operation: "ship merge product", quantity: 4, due: timestamp(10), priority: 2, minShipment: 1 },
        { name: "merge order C exact maximum", item: "merge product", location: "merge plant", operation: "ship merge product", quantity: 3, due: timestamp(10), priority: 3, minShipment: 1 },
      ],
    },
  );
}

function operationPlanMergeGuardsScenario() {
  return scenario(
    "operationplan_merge_guards",
    "离散制造合并保护",
    "Fixed-quantity material flows and default resources keep otherwise equal fixed-time supply plans separate",
    ["fixed flow guard", "default resource guard", "同日期计划", "合并保护", "固定产出"],
    {
      current: timestamp(0),
      plan: { allowMergingOperationPlans: true },
      solver: { constraints: 15, plantype: 1, lazyDelay: HOUR, minimumDelay: HOUR },
      locations: [{ name: "merge guard plant" }],
      items: [{ name: "fixed flow product" }, { name: "resource guard product" }],
      operations: [
        { name: "make fixed flow product", type: "fixed_time", duration: 4 * HOUR, location: "merge guard plant", sizeMinimum: 1, sizeMaximum: 50, cost: 3 },
        { name: "ship fixed flow product", type: "fixed_time", duration: HOUR, location: "merge guard plant" },
        { name: "make resource guard product", type: "fixed_time", duration: 4 * HOUR, location: "merge guard plant", sizeMinimum: 1, sizeMaximum: 50, cost: 5 },
        { name: "ship resource guard product", type: "fixed_time", duration: HOUR, location: "merge guard plant" },
      ],
      buffers: [
        { name: "fixed flow product @ plant", item: "fixed flow product", location: "merge guard plant", producing: "make fixed flow product", onhand: 0 },
        { name: "resource guard product @ plant", item: "resource guard product", location: "merge guard plant", producing: "make resource guard product", onhand: 0 },
      ],
      resources: [
        { name: "merge guard machine", maximum: 100, maxearly: 20 * DAY, location: "merge guard plant", efficiency: 100 },
      ],
      loads: [
        { operation: "make resource guard product", resource: "merge guard machine", quantity: 1 },
      ],
      flows: [
        { type: "end", operation: "make fixed flow product", buffer: "fixed flow product @ plant", quantity: 1, quantityFixed: 2 },
        { type: "start", operation: "ship fixed flow product", buffer: "fixed flow product @ plant", quantity: -1 },
        { type: "end", operation: "make resource guard product", buffer: "resource guard product @ plant", quantity: 1 },
        { type: "start", operation: "ship resource guard product", buffer: "resource guard product @ plant", quantity: -1 },
      ],
      demands: [
        { name: "fixed flow guard order A", item: "fixed flow product", location: "merge guard plant", operation: "ship fixed flow product", quantity: 5, due: timestamp(10), priority: 1, minShipment: 1 },
        { name: "fixed flow guard order B", item: "fixed flow product", location: "merge guard plant", operation: "ship fixed flow product", quantity: 5, due: timestamp(10), priority: 2, minShipment: 1 },
        { name: "resource guard order A", item: "resource guard product", location: "merge guard plant", operation: "ship resource guard product", quantity: 2, due: timestamp(12), priority: 3, minShipment: 1 },
        { name: "resource guard order B", item: "resource guard product", location: "merge guard plant", operation: "ship resource guard product", quantity: 2, due: timestamp(12), priority: 4, minShipment: 1 },
      ],
    },
  );
}

function bufferMinimumExcessScenario() {
  return scenario(
    "buffer_minimum_excess",
    "库存安全量清理",
    "New demand supply preserves the buffer minimum and removes a later proposed plan that has become fully redundant",
    ["buffer minimum", "isExcess", "后续冗余计划", "安全库存", "proposed 清理"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: HOUR, minimumDelay: HOUR, erasePreviousFirst: false },
      locations: [{ name: "minimum plant" }],
      items: [{ name: "minimum product" }],
      operations: [
        { name: "make minimum product", type: "fixed_time", duration: 6 * HOUR, location: "minimum plant", sizeMinimum: 1, sizeMaximum: 20, cost: 4 },
        { name: "ship minimum product", type: "fixed_time", duration: HOUR, location: "minimum plant" },
      ],
      buffers: [
        { name: "minimum product @ plant", item: "minimum product", location: "minimum plant", producing: "make minimum product", onhand: 3, minimum: 3 },
      ],
      resources: [], loads: [],
      flows: [
        { type: "end", operation: "make minimum product", buffer: "minimum product @ plant", quantity: 1 },
        { type: "start", operation: "ship minimum product", buffer: "minimum product @ plant", quantity: -1 },
      ],
      operationPlans: [
        { reference: "MO-MINIMUM-LATER", operation: "make minimum product", quantity: 2, start: timestamp(20), end: timestamp(20, 6), status: "proposed" },
      ],
      demands: [
        { name: "minimum replacement order", item: "minimum product", location: "minimum plant", operation: "ship minimum product", quantity: 3, due: timestamp(15), priority: 1, minShipment: 1 },
      ],
    },
  );
}

function bufferMaximumExcessScenario() {
  return scenario(
    "buffer_maximum_excess",
    "库存上限清理",
    "The positive buffer maximum takes precedence in excess evaluation and removes later supply above the inventory ceiling",
    ["buffer maximum", "maximum 优先", "isExcess", "库存上限", "后续计划清理"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: HOUR, minimumDelay: HOUR, erasePreviousFirst: false },
      locations: [{ name: "maximum plant" }],
      items: [{ name: "maximum product" }],
      operations: [
        { name: "make maximum product", type: "fixed_time", duration: 6 * HOUR, location: "maximum plant", sizeMinimum: 1, sizeMaximum: 20, cost: 4 },
        { name: "ship maximum product", type: "fixed_time", duration: HOUR, location: "maximum plant" },
      ],
      buffers: [
        { name: "maximum product @ plant", item: "maximum product", location: "maximum plant", producing: "make maximum product", onhand: 3, minimum: 3, maximum: 3 },
      ],
      resources: [], loads: [],
      flows: [
        { type: "end", operation: "make maximum product", buffer: "maximum product @ plant", quantity: 1 },
        { type: "start", operation: "ship maximum product", buffer: "maximum product @ plant", quantity: -1 },
      ],
      operationPlans: [
        { reference: "MO-MAXIMUM-LATER", operation: "make maximum product", quantity: 2, start: timestamp(20), end: timestamp(20, 6), status: "proposed" },
      ],
      demands: [
        { name: "maximum replacement order", item: "maximum product", location: "maximum plant", operation: "ship maximum product", quantity: 3, due: timestamp(15), priority: 1, minShipment: 1 },
      ],
    },
  );
}

function calendarMinMaxExcessScenario() {
  return scenario(
    "calendar_minmax_excess",
    "动态库存边界",
    "Minimum calendar transitions preserve required later supply, while maximum calendar targets don't create demand and redundant later supply is removed",
    ["minimum calendar", "maximum calendar", "时间线事件", "动态安全库存", "动态库存上限", "差异化 excess 语义"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: HOUR, minimumDelay: HOUR, erasePreviousFirst: false },
      calendars: [
        {
          name: "minimum inventory band", default: 3,
          buckets: [{ start: timestamp(18), end: timestamp(22), value: 6, priority: 1 }],
        },
        {
          name: "maximum inventory band", default: 3,
          buckets: [{ start: timestamp(18), end: timestamp(22), value: 6, priority: 1 }],
        },
      ],
      locations: [{ name: "calendar inventory plant" }],
      items: [{ name: "calendar minimum product" }, { name: "calendar maximum product" }],
      operations: [
        { name: "make calendar minimum product", type: "fixed_time", duration: 6 * HOUR, location: "calendar inventory plant", sizeMinimum: 1, sizeMaximum: 20, cost: 4 },
        { name: "ship calendar minimum product", type: "fixed_time", duration: HOUR, location: "calendar inventory plant" },
        { name: "make calendar maximum product", type: "fixed_time", duration: 6 * HOUR, location: "calendar inventory plant", sizeMinimum: 1, sizeMaximum: 20, cost: 4 },
        { name: "ship calendar maximum product", type: "fixed_time", duration: HOUR, location: "calendar inventory plant" },
      ],
      buffers: [
        { name: "calendar minimum product @ plant", item: "calendar minimum product", location: "calendar inventory plant", producing: "make calendar minimum product", onhand: 3, minimumCalendar: "minimum inventory band" },
        { name: "calendar maximum product @ plant", item: "calendar maximum product", location: "calendar inventory plant", producing: "make calendar maximum product", onhand: 3, minimum: 3, maximumCalendar: "maximum inventory band" },
      ],
      resources: [], loads: [],
      flows: [
        { type: "end", operation: "make calendar minimum product", buffer: "calendar minimum product @ plant", quantity: 1 },
        { type: "start", operation: "ship calendar minimum product", buffer: "calendar minimum product @ plant", quantity: -1 },
        { type: "end", operation: "make calendar maximum product", buffer: "calendar maximum product @ plant", quantity: 1 },
        { type: "start", operation: "ship calendar maximum product", buffer: "calendar maximum product @ plant", quantity: -1 },
      ],
      operationPlans: [
        { reference: "MO-CALENDAR-MINIMUM-LATER", operation: "make calendar minimum product", quantity: 2, start: timestamp(20), end: timestamp(20, 6), status: "proposed" },
        { reference: "MO-CALENDAR-MAXIMUM-LATER", operation: "make calendar maximum product", quantity: 2, start: timestamp(22), end: timestamp(22, 6), status: "proposed" },
      ],
      demands: [
        { name: "calendar minimum replacement", item: "calendar minimum product", location: "calendar inventory plant", operation: "ship calendar minimum product", quantity: 3, due: timestamp(15), priority: 1, minShipment: 1 },
        { name: "calendar maximum replacement", item: "calendar maximum product", location: "calendar inventory plant", operation: "ship calendar maximum product", quantity: 3, due: timestamp(15), priority: 2, minShipment: 1 },
      ],
    },
  );
}

function commandScopedExcessScenario() {
  return scenario(
    "command_scoped_excess",
    "事务范围库存清理",
    "Command-scoped cleanup handles active solver commands first, and the final cluster-wide pass removes unrelated proposed supply above its inventory target",
    ["CommandManager scope", "active command", "unrelated proposed plan", "事务清理", "cluster-wide cleanup"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: HOUR, minimumDelay: HOUR, erasePreviousFirst: false },
      locations: [{ name: "command scope plant" }],
      items: [{ name: "scoped demand product" }, { name: "unrelated excess product" }],
      operations: [
        { name: "make scoped demand product", type: "fixed_time", duration: 5 * HOUR, location: "command scope plant", sizeMinimum: 1, sizeMaximum: 20, cost: 4 },
        { name: "ship scoped demand product", type: "fixed_time", duration: HOUR, location: "command scope plant" },
        { name: "make unrelated excess product", type: "fixed_time", duration: 5 * HOUR, location: "command scope plant", sizeMinimum: 1, sizeMaximum: 20, cost: 4 },
      ],
      buffers: [
        { name: "scoped demand product @ plant", item: "scoped demand product", location: "command scope plant", producing: "make scoped demand product", onhand: 0 },
        { name: "unrelated excess product @ plant", item: "unrelated excess product", location: "command scope plant", producing: "make unrelated excess product", onhand: 5 },
      ],
      resources: [], loads: [],
      flows: [
        { type: "end", operation: "make scoped demand product", buffer: "scoped demand product @ plant", quantity: 1 },
        { type: "start", operation: "ship scoped demand product", buffer: "scoped demand product @ plant", quantity: -1 },
        { type: "end", operation: "make unrelated excess product", buffer: "unrelated excess product @ plant", quantity: 1 },
      ],
      operationPlans: [
        { reference: "MO-UNRELATED-EXCESS", operation: "make unrelated excess product", quantity: 2, start: timestamp(12), end: timestamp(12, 5), status: "proposed" },
      ],
      demands: [
        { name: "scoped demand order", item: "scoped demand product", location: "command scope plant", operation: "ship scoped demand product", quantity: 4, due: timestamp(10), priority: 1, minShipment: 1 },
      ],
    },
  );
}

function routingHardPosttimeScenario() {
  return scenario(
    "routing_hard_posttime",
    "精密装配工序间隔",
    "A hard routing posttime keeps the curing interval between consecutive steps in backward and forward scheduling",
    ["routing hard_posttime", "工序后等待", "前后向传播", "多订单", "有限产能"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: HOUR, minimumDelay: HOUR },
      locations: [{ name: "hard posttime plant" }],
      items: [{ name: "hard posttime raw" }, { name: "hard posttime product" }],
      operations: [
        { name: "hard posttime cure", type: "fixed_time", duration: DAY, posttime: 2 * DAY, location: "hard posttime plant", sizeMinimum: 1, sizeMaximum: 8, cost: 5 },
        { name: "hard posttime finish", type: "fixed_time", duration: DAY, location: "hard posttime plant", sizeMinimum: 1, sizeMaximum: 8, cost: 7 },
        {
          name: "hard posttime routing", type: "routing", location: "hard posttime plant", hardPosttime: true,
          suboperations: [
            { operation: "hard posttime cure", priority: 1 },
            { operation: "hard posttime finish", priority: 2 },
          ],
        },
        { name: "ship hard posttime product", type: "fixed_time", duration: HOUR, location: "hard posttime plant" },
      ],
      buffers: [
        { name: "hard posttime raw @ plant", item: "hard posttime raw", location: "hard posttime plant", onhand: 60 },
        { name: "hard posttime product @ plant", item: "hard posttime product", location: "hard posttime plant", producing: "hard posttime routing", onhand: 0 },
      ],
      resources: [
        { name: "hard posttime cure resource", maximum: 1, maxearly: 30 * DAY, location: "hard posttime plant", efficiency: 100 },
        { name: "hard posttime finish resource", maximum: 1, maxearly: 30 * DAY, location: "hard posttime plant", efficiency: 100 },
      ],
      loads: [
        { operation: "hard posttime cure", resource: "hard posttime cure resource", quantity: 1 },
        { operation: "hard posttime finish", resource: "hard posttime finish resource", quantity: 1 },
      ],
      flows: [
        { type: "start", operation: "hard posttime cure", buffer: "hard posttime raw @ plant", quantity: -1 },
        { type: "end", operation: "hard posttime finish", buffer: "hard posttime product @ plant", quantity: 1 },
        { type: "start", operation: "ship hard posttime product", buffer: "hard posttime product @ plant", quantity: -1 },
      ],
      demands: [
        { name: "hard posttime order A", item: "hard posttime product", location: "hard posttime plant", operation: "ship hard posttime product", quantity: 4, due: timestamp(8), priority: 1, minShipment: 1 },
        { name: "hard posttime order B", item: "hard posttime product", location: "hard posttime plant", operation: "ship hard posttime product", quantity: 6, due: timestamp(11), priority: 2, minShipment: 1 },
        { name: "hard posttime order C", item: "hard posttime product", location: "hard posttime plant", operation: "ship hard posttime product", quantity: 5, due: timestamp(14), priority: 3, minShipment: 1 },
      ],
    },
  );
}

function heuristic2ForwardRepairScenario() {
  return scenario(
    "heuristic2_forward_repair",
    "瓶颈产线前推修复",
    "Heuristic two repairs overloaded backward plans in repeated forward and batch-grouped backward sweeps",
    ["algorithm=heuristic_2", "plantype=1", "forward repair", "锁定产能", "重复扫掠"],
    {
      current: timestamp(0),
      solver: {
        constraints: 15, plantype: 1, algorithm: "heuristic_2", lazyDelay: HOUR,
        minimumDelay: HOUR, iterationMax: 32, resourceIterationMax: 32,
        erasePreviousFirst: false,
      },
      locations: [{ name: "forward repair plant" }],
      items: [{ name: "forward repair raw" }, { name: "forward repair product" }],
      operations: [
        { name: "make forward repair product", type: "fixed_time", duration: 2 * DAY, location: "forward repair plant", sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 5, cost: 6 },
        { name: "ship forward repair product", type: "fixed_time", duration: HOUR, location: "forward repair plant" },
      ],
      buffers: [
        { name: "forward repair raw @ plant", item: "forward repair raw", location: "forward repair plant", onhand: 80 },
        { name: "forward repair product @ plant", item: "forward repair product", location: "forward repair plant", producing: "make forward repair product", onhand: 0 },
      ],
      resources: [{ name: "forward repair bottleneck", maximum: 1, maxearly: 20 * DAY, location: "forward repair plant", efficiency: 100 }],
      loads: [{ operation: "make forward repair product", resource: "forward repair bottleneck", quantity: 1 }],
      flows: [
        { type: "start", operation: "make forward repair product", buffer: "forward repair raw @ plant", quantity: -1 },
        { type: "end", operation: "make forward repair product", buffer: "forward repair product @ plant", quantity: 1 },
        { type: "start", operation: "ship forward repair product", buffer: "forward repair product @ plant", quantity: -1 },
      ],
      operationPlans: [
        { reference: "MO-FORWARD-LOCKED", operation: "make forward repair product", quantity: 5, start: timestamp(0), end: timestamp(3), status: "confirmed" },
      ],
      demands: Array.from({ length: 8 }, (_, index) => ({
        name: `forward repair order ${String(index + 1).padStart(2, "0")}`,
        item: "forward repair product", location: "forward repair plant", operation: "ship forward repair product",
        quantity: (index % 4) + 2, due: timestamp(2 + Math.floor(index / 2), (index % 2) * 12),
        priority: index + 1, minShipment: 1,
      })),
    },
  );
}

function autofenceTemporaryShortageScenario() {
  return scenario(
    "autofence_temporary_shortage",
    "短期缺料恢复",
    "A confirmed consumption followed by confirmed replenishment inside the autofence is masked only during planning and leaves no correction order",
    ["autofence", "temporary shortage mask", "confirmed flow", "自动清理", "重复求解隔离"],
    {
      current: timestamp(0),
      plan: { autoFence: 3 * DAY },
      solver: { constraints: 15, plantype: 1, lazyDelay: HOUR, minimumDelay: HOUR, erasePreviousFirst: false },
      locations: [{ name: "autofence plant" }],
      items: [{ name: "autofence component" }, { name: "autofence product" }],
      operations: [
        { name: "replenish autofence component", type: "fixed_time", duration: DAY, location: "autofence plant", sizeMinimum: 1, sizeMaximum: 20, cost: 3 },
        { name: "confirmed component issue", type: "fixed_time", duration: HOUR, location: "autofence plant" },
        { name: "confirmed component receipt", type: "fixed_time", duration: HOUR, location: "autofence plant" },
        { name: "make autofence product", type: "fixed_time", duration: DAY, location: "autofence plant", sizeMinimum: 1, sizeMaximum: 10, cost: 5 },
        { name: "ship autofence product", type: "fixed_time", duration: HOUR, location: "autofence plant" },
      ],
      buffers: [
        { name: "autofence component @ plant", item: "autofence component", location: "autofence plant", producing: "replenish autofence component", onhand: 0 },
        { name: "autofence product @ plant", item: "autofence product", location: "autofence plant", producing: "make autofence product", onhand: 0 },
      ],
      resources: [{ name: "autofence production line", maximum: 1, maxearly: 20 * DAY, location: "autofence plant", efficiency: 100 }],
      loads: [
        { operation: "replenish autofence component", resource: "autofence production line", quantity: 1 },
        { operation: "make autofence product", resource: "autofence production line", quantity: 1 },
      ],
      flows: [
        { type: "end", operation: "replenish autofence component", buffer: "autofence component @ plant", quantity: 1 },
        { type: "start", operation: "confirmed component issue", buffer: "autofence component @ plant", quantity: -1 },
        { type: "end", operation: "confirmed component receipt", buffer: "autofence component @ plant", quantity: 1 },
        { type: "start", operation: "make autofence product", buffer: "autofence component @ plant", quantity: -1 },
        { type: "end", operation: "make autofence product", buffer: "autofence product @ plant", quantity: 1 },
        { type: "start", operation: "ship autofence product", buffer: "autofence product @ plant", quantity: -1 },
      ],
      operationPlans: [
        { reference: "AUTOFENCE-ISSUE", operation: "confirmed component issue", quantity: 8, start: timestamp(1), end: timestamp(1, 1), status: "confirmed" },
        { reference: "AUTOFENCE-RECEIPT", operation: "confirmed component receipt", quantity: 8, start: timestamp(2), end: timestamp(2, 1), status: "confirmed" },
      ],
      demands: [
        { name: "autofence customer order A", item: "autofence product", location: "autofence plant", operation: "ship autofence product", quantity: 5, due: timestamp(8), priority: 1, minShipment: 1 },
        { name: "autofence customer order B", item: "autofence product", location: "autofence plant", operation: "ship autofence product", quantity: 4, due: timestamp(11), priority: 2, minShipment: 1 },
      ],
    },
  );
}

function incrementalLockedReplanScenario() {
  return scenario(
    "incremental_locked_replan",
    "滚动计划增量重排",
    "An incremental solve consumes confirmed and approved supply, retains usable proposed supply, and adds only the remaining requirement",
    ["erasePreviousFirst=false", "proposed", "approved", "confirmed", "增量补单", "锁定日期"],
    {
      current: timestamp(0),
      solver: { constraints: 15, plantype: 1, lazyDelay: HOUR, minimumDelay: HOUR, erasePreviousFirst: false },
      locations: [{ name: "incremental plant" }],
      items: [{ name: "incremental raw" }, { name: "incremental product" }],
      operations: [
        { name: "make incremental product", type: "fixed_time", duration: DAY, location: "incremental plant", sizeMinimum: 1, sizeMultiple: 1, sizeMaximum: 6, cost: 4 },
        { name: "ship incremental product", type: "fixed_time", duration: HOUR, location: "incremental plant" },
      ],
      buffers: [
        { name: "incremental raw @ plant", item: "incremental raw", location: "incremental plant", onhand: 100 },
        { name: "incremental product @ plant", item: "incremental product", location: "incremental plant", producing: "make incremental product", onhand: 0 },
      ],
      resources: [{ name: "incremental line", maximum: 1, maxearly: 30 * DAY, location: "incremental plant", efficiency: 100 }],
      loads: [{ operation: "make incremental product", resource: "incremental line", quantity: 1 }],
      flows: [
        { type: "start", operation: "make incremental product", buffer: "incremental raw @ plant", quantity: -1 },
        { type: "end", operation: "make incremental product", buffer: "incremental product @ plant", quantity: 1 },
        { type: "start", operation: "ship incremental product", buffer: "incremental product @ plant", quantity: -1 },
      ],
      operationPlans: [
        { reference: "MO-INCREMENTAL-CONFIRMED", operation: "make incremental product", quantity: 3, start: timestamp(1), end: timestamp(2), status: "confirmed" },
        { reference: "MO-INCREMENTAL-APPROVED", operation: "make incremental product", quantity: 4, start: timestamp(3), end: timestamp(4), status: "approved" },
        { reference: "MO-INCREMENTAL-PROPOSED", operation: "make incremental product", quantity: 5, start: timestamp(6), end: timestamp(7), status: "proposed" },
      ],
      demands: [
        { name: "incremental order urgent", item: "incremental product", location: "incremental plant", operation: "ship incremental product", quantity: 5, due: timestamp(5), priority: 1, minShipment: 1 },
        { name: "incremental order regular", item: "incremental product", location: "incremental plant", operation: "ship incremental product", quantity: 10, due: timestamp(9), priority: 2, minShipment: 1 },
        { name: "incremental order later", item: "incremental product", location: "incremental plant", operation: "ship incremental product", quantity: 6, due: timestamp(13), priority: 3, minShipment: 1 },
      ],
    },
  );
}

export function buildComplexScenarios() {
  return [
    automotiveScenario(),
    electronicsScenario(),
    pharmaceuticalScenario(),
    foodScenario(),
    aerospaceScenario(),
    packagingScenario(),
    peakLoadBoundaryScenario(),
    lotSplitBoundaryScenario(),
    timeCapacityBoundaryScenario(),
    unconstrainedBoundaryScenario(),
    solverModesBoundaryScenario(),
    operationSplitRatioScenario(),
    dependencyHardSoftLeadtimeScenario(),
    demandGroupAllTogetherScenario(),
    demandGroupInRatioScenario(),
    purchaseSupplierEffectivityScenario(),
    purchaseResourceCapacityScenario(),
    distributionMultilocationScenario(),
    calendarShiftShutdownScenario(),
    calendarDstOverlapScenario(),
    bucketizedCapacityScenario(),
    bucketizedPercentageLoadScenario(),
    transferBatchRoutingScenario(),
    mtoBatchIsolationScenario(),
    alternateMinCostPenaltyScenario(),
    timePerLotSizeScenario(),
    confirmedApprovedOrdersScenario(),
    partialCompletedOrderScenario(),
    lockedSetupScenario(),
    operationPlanDependencyScenario(),
    operationPlanCreationMergeScenario(),
    operationPlanMergeGuardsScenario(),
    bufferMinimumExcessScenario(),
    bufferMaximumExcessScenario(),
    calendarMinMaxExcessScenario(),
    commandScopedExcessScenario(),
    routingHardPosttimeScenario(),
    heuristic2ForwardRepairScenario(),
    autofenceTemporaryShortageScenario(),
    incrementalLockedReplanScenario(),
  ];
}
