// Employee names. Pure visual flavor, like `characterType`: a name never affects
// the simulation, it only turns "3 employees" into people the player recognizes.
//
// An employee stores INDICES into these pools, never a string, so the save stays
// locale-independent and a name is translated like the rest of the UI: slot 4 is
// "Anna" in English and "Анна" in Russian. Every language must therefore declare
// pools of the SAME length (checked by scripts/validate_employee_names.mjs).
//
// Gender follows the sprite (`woman_employee` → female), so the name always
// matches the character on the office floor. Russian surnames are gendered, so
// each language declares a male and a female surname pool of equal length.

const EN_SURNAMES = [
  "Reed", "Parker", "Brooks", "Hayes", "Foster", "Bennett", "Ward", "Blake",
  "Chen", "Novak", "Silva", "Diaz", "Fisher", "Grant", "Hale", "Keller",
  "Lowe", "Marsh", "Nash", "Pike", "Quinn", "Rhodes", "Stone", "Vaughn",
];

const POOLS = {
  en: {
    first: {
      male: [
        "James", "Michael", "David", "Chris", "Daniel", "Ethan", "Liam", "Noah",
        "Oliver", "Lucas", "Mason", "Henry", "Jack", "Leo", "Adam", "Ryan",
        "Victor", "Marcus", "Felix", "Omar", "Diego", "Andre", "Samuel", "Nathan",
      ],
      female: [
        "Anna", "Emma", "Olivia", "Sophia", "Chloe", "Mia", "Grace", "Ava",
        "Nina", "Zoe", "Clara", "Julia", "Maya", "Elena", "Ruby", "Iris",
        "Lena", "Sara", "Alice", "Freya", "Nora", "Ivy", "Hazel", "Lucy",
      ],
    },
    last: { male: EN_SURNAMES, female: EN_SURNAMES },
  },
  ru: {
    first: {
      male: [
        "Артём", "Иван", "Дмитрий", "Сергей", "Максим", "Никита", "Егор", "Кирилл",
        "Роман", "Павел", "Алексей", "Андрей", "Михаил", "Владимир", "Илья", "Тимур",
        "Денис", "Антон", "Глеб", "Руслан", "Олег", "Виктор", "Марк", "Фёдор",
      ],
      female: [
        "Анна", "Мария", "Ольга", "Екатерина", "Дарья", "Полина", "Алиса", "София",
        "Ксения", "Виктория", "Юлия", "Елена", "Ирина", "Наталья", "Алина", "Вера",
        "Марина", "Кристина", "Татьяна", "Милана", "Евгения", "Светлана", "Арина", "Лиза",
      ],
    },
    last: {
      male: [
        "Иванов", "Петров", "Смирнов", "Кузнецов", "Соколов", "Попов", "Лебедев", "Козлов",
        "Новиков", "Морозов", "Волков", "Зайцев", "Павлов", "Семёнов", "Голубев", "Виноградов",
        "Богданов", "Воробьёв", "Фёдоров", "Михайлов", "Беляев", "Тарасов", "Белов", "Комаров",
      ],
      female: [
        "Иванова", "Петрова", "Смирнова", "Кузнецова", "Соколова", "Попова", "Лебедева", "Козлова",
        "Новикова", "Морозова", "Волкова", "Зайцева", "Павлова", "Семёнова", "Голубева", "Виноградова",
        "Богданова", "Воробьёва", "Фёдорова", "Михайлова", "Беляева", "Тарасова", "Белова", "Комарова",
      ],
    },
  },
};

const DEFAULT_LANGUAGE = "en";

export const EMPLOYEE_NAME_POOLS = POOLS;
export const EMPLOYEE_FIRST_NAME_COUNT = POOLS.en.first.male.length;
export const EMPLOYEE_SURNAME_COUNT = POOLS.en.last.male.length;

// Character sprites are the only gender signal, and they are cosmetic.
export function getEmployeeGender(employee) {
  return employee?.characterType === "woman_employee" ? "female" : "male";
}

// Rolled once, at hire time, and kept for the employee's lifetime — including
// when they are moved between departments.
export function rollEmployeeName() {
  return {
    nameIndex: Math.floor(Math.random() * EMPLOYEE_FIRST_NAME_COUNT),
    surnameIndex: Math.floor(Math.random() * EMPLOYEE_SURNAME_COUNT),
  };
}

function hashId(id) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 1_000_003;
  }
  return hash;
}

// Saves made before names existed carry no indices. Deriving them from the
// employee id gives those people a stable name with no migration step.
function resolveIndices(employee) {
  const seed = hashId(String(employee?.id ?? "emp"));
  const raw = {
    nameIndex: Number.isInteger(employee?.nameIndex) ? employee.nameIndex : seed,
    surnameIndex: Number.isInteger(employee?.surnameIndex) ? employee.surnameIndex : Math.floor(seed / 7) + 3,
  };
  return {
    nameIndex: ((raw.nameIndex % EMPLOYEE_FIRST_NAME_COUNT) + EMPLOYEE_FIRST_NAME_COUNT) % EMPLOYEE_FIRST_NAME_COUNT,
    surnameIndex: ((raw.surnameIndex % EMPLOYEE_SURNAME_COUNT) + EMPLOYEE_SURNAME_COUNT) % EMPLOYEE_SURNAME_COUNT,
  };
}

export function getEmployeeFirstName(employee, language = DEFAULT_LANGUAGE) {
  if (!employee) return "";
  const pool = POOLS[language] ?? POOLS[DEFAULT_LANGUAGE];
  const { nameIndex } = resolveIndices(employee);
  return pool.first[getEmployeeGender(employee)][nameIndex];
}

export function getEmployeeName(employee, language = DEFAULT_LANGUAGE) {
  if (!employee) return "";
  const pool = POOLS[language] ?? POOLS[DEFAULT_LANGUAGE];
  const gender = getEmployeeGender(employee);
  const { nameIndex, surnameIndex } = resolveIndices(employee);
  return `${pool.first[gender][nameIndex]} ${pool.last[gender][surnameIndex]}`;
}
