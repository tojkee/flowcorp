// Validates employee names: pool integrity across languages, name assignment on
// hire, identity that survives transfers, and the named quit notification.
// Deterministic Node script. Run: npm run validate:names
import { COMPANY_TYPES } from "../src/data/companyTypes.js";
import {
  EMPLOYEE_FIRST_NAME_COUNT,
  EMPLOYEE_NAME_POOLS,
  EMPLOYEE_SURNAME_COUNT,
  getEmployeeFirstName,
  getEmployeeGender,
  getEmployeeName,
} from "../src/data/employeeNames.js";
import { createSimulation, DYNAMIC_EVENTS, getMetrics, hireForDepartment, rebalanceEmployees } from "../src/core/simulation.js";
import { evaluateNotifications } from "../src/core/notifications.js";

let checks = 0;
function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  checks += 1;
}

const IT = COMPANY_TYPES[0];
const LANGUAGES = Object.keys(EMPLOYEE_NAME_POOLS);
const GENDERS = ["male", "female"];

// --- Pool integrity ---------------------------------------------------------
// An employee stores indices, so every language must offer the same number of
// slots or a name would resolve differently (or not at all) per language.
assert(LANGUAGES.length >= 2, "At least two languages ship name pools.");
for (const language of LANGUAGES) {
  for (const gender of GENDERS) {
    const first = EMPLOYEE_NAME_POOLS[language].first[gender];
    const last = EMPLOYEE_NAME_POOLS[language].last[gender];
    assert(first.length === EMPLOYEE_FIRST_NAME_COUNT, `${language}/${gender} first-name pool has the shared length.`);
    assert(last.length === EMPLOYEE_SURNAME_COUNT, `${language}/${gender} surname pool has the shared length.`);
    assert(first.every((name) => typeof name === "string" && name.trim().length > 1), `${language}/${gender} first names are non-empty.`);
    assert(last.every((name) => typeof name === "string" && name.trim().length > 1), `${language}/${gender} surnames are non-empty.`);
    assert(new Set(first).size === first.length, `${language}/${gender} first names are unique.`);
    assert(new Set(last).size === last.length, `${language}/${gender} surnames are unique.`);
  }
}

// --- Assignment -------------------------------------------------------------
let sim = createSimulation(IT);
const staff = sim.departments.flatMap((department) => department.staff);
assert(staff.length > 0, "A new company starts with staff.");
for (const employee of staff) {
  assert(Number.isInteger(employee.nameIndex) && employee.nameIndex >= 0 && employee.nameIndex < EMPLOYEE_FIRST_NAME_COUNT, "Name index is in range.");
  assert(Number.isInteger(employee.surnameIndex) && employee.surnameIndex >= 0 && employee.surnameIndex < EMPLOYEE_SURNAME_COUNT, "Surname index is in range.");
  for (const language of LANGUAGES) {
    const full = getEmployeeName(employee, language);
    assert(full.split(" ").length === 2 && full.trim().length > 3, `Name resolves in ${language}.`);
    assert(full.startsWith(getEmployeeFirstName(employee, language)), `Full name starts with the first name in ${language}.`);
  }
}

// The name matches the sprite: woman sprites read from the female pools.
const women = staff.filter((employee) => employee.characterType === "woman_employee");
for (const employee of women) {
  assert(getEmployeeGender(employee) === "female", "Woman sprite maps to the female pool.");
  assert(EMPLOYEE_NAME_POOLS.en.first.female.includes(getEmployeeFirstName(employee, "en")), "Female name comes from the female pool.");
}

// Names are randomized, not sequential: a decent-sized office is not all one name.
const bigOffice = Array.from({ length: 40 }, (_, index) => createSimulation(IT)).flatMap((company) =>
  company.departments.flatMap((department) => department.staff.map((employee) => getEmployeeName(employee, "en"))),
);
assert(new Set(bigOffice).size > 10, "Names vary across employees.");

// --- Stability --------------------------------------------------------------
const sample = staff[0];
assert(getEmployeeName(sample, "en") === getEmployeeName({ ...sample }, "en"), "The same employee always resolves to the same name.");
assert(getEmployeeName(sample, "ru") !== getEmployeeName(sample, "en"), "The name is localized, not a single hardcoded string.");

// Saves made before names existed carry no indices — they must still get a
// stable name derived from the employee id, not a crash or a blank.
const legacy = { id: "emp_7", departmentId: "sales", characterType: "red_employee" };
const legacyName = getEmployeeName(legacy, "en");
assert(legacyName.split(" ").length === 2, "A legacy employee (no indices) still gets a full name.");
assert(legacyName === getEmployeeName(legacy, "en"), "The legacy fallback name is stable.");
assert(getEmployeeName({ ...legacy, id: "emp_8" }, "en") !== legacyName, "Different legacy ids get different names.");

// --- Identity through hire and transfer ------------------------------------
const salesId = IT.departments[0].id;
sim.cash = 100_000;
const hired = hireForDepartment(sim, salesId);
const newcomer = hired.departments.find((department) => department.id === salesId).staff.at(-1);
assert(hired.lastHire?.id === newcomer.id, "The hire is recorded for named feedback.");
assert(getEmployeeName(hired.lastHire, "ru").length > 3, "The new hire has a resolvable name.");

// Overload a department so a rebalance has a target, then check the moved person
// keeps their name in their new department.
let moved = hired;
moved.departments[1].queue = Array.from({ length: 20 }, (_, index) => index + 1);
moved = rebalanceEmployees(moved);
if (moved.lastTransfer) {
  const target = moved.departments.find((department) => department.id === moved.lastTransfer.departmentId);
  const person = target.staff.find((employee) => employee.id === moved.lastTransfer.id);
  assert(Boolean(person), "The transferred employee is in the target department.");
  assert(getEmployeeName(person, "en") === getEmployeeName(moved.lastTransfer, "en"), "A transfer keeps the person's name.");
  checks += 1;
}

// --- The quit event names who left -----------------------------------------
const quit = DYNAMIC_EVENTS.find((event) => event.type === "employeeQuit");
let quitState = createSimulation(IT);
quit.apply(quitState);
assert(quitState.pendingEventPerson?.employee, "A quit records the person who left.");
assert(getEmployeeName(quitState.pendingEventPerson.employee, "en").length > 3, "The leaver has a resolvable name.");

// …and the notification carries them to the inbox.
const notified = createSimulation(IT);
notified.lastDynamicEvent = {
  id: "employeeQuit_1",
  type: "employeeQuit",
  severity: "bad",
  at: 1,
  person: { employee: quitState.pendingEventPerson.employee, departmentId: quitState.pendingEventPerson.departmentId },
};
const { newItems } = evaluateNotifications(notified, getMetrics(notified), 10_000_000_000, {}, []);
const item = newItems.find((entry) => entry.ruleId === "dynamicEventBad");
assert(Boolean(item), "A bad dynamic event still notifies.");
assert(item.vars.employee?.id === quitState.pendingEventPerson.employee.id, "The notification carries the employee who left.");
assert(Boolean(item.vars.departmentId), "The notification carries the department that lost them.");

console.log(`Employee-name validation passed (${checks} checks).`);
