/**
 * Safely parse any input into a valid JS Date object or null.
 * Handles Firestore Timestamps ({ seconds, nanoseconds } or .toDate()),
 * Date instances, ISO strings, timestamp numbers, etc.
 */
export function parseDate(val) {
  if (val === null || val === undefined) return null;

  // 1. Firestore Timestamp object with .toDate()
  if (typeof val.toDate === "function") {
    try {
      const d = val.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch (e) {
      // ignore and try fallback
    }
  }

  // 2. Plain object with seconds ({ seconds: 12345678, nanoseconds: 0 })
  if (typeof val === "object" && typeof val.seconds === "number") {
    const d = new Date(val.seconds * 1000);
    if (!isNaN(d.getTime())) return d;
  }

  // 3. Date instance
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  // 4. Number (timestamp in ms or sec)
  if (typeof val === "number") {
    // If seconds instead of ms (e.g. 10 digits vs 13 digits)
    const ms = val < 10000000000 ? val * 1000 : val;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  // 5. String (e.g. "2026-07-26T15:00:00.000Z", "2026-07-26", "2026/07/26")
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Format any date representation into "YYYY-MM-DD" string.
 */
export function formatDate(val, fallback = "-") {
  const d = parseDate(val);
  if (!d) return fallback;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format any date representation into "YYYY-MM-DD HH:mm" string.
 */
export function formatDateTime(val, fallback = "-") {
  const d = parseDate(val);
  if (!d) return fallback;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${mins}`;
}

/**
 * Check if two dates/timestamps fall on the same YYYY-MM-DD day.
 */
export function isSameDay(val1, val2) {
  const dateStr1 = formatDate(val1, "DATE1_INVALID");
  const dateStr2 = formatDate(val2, "DATE2_INVALID");
  if (dateStr1 === "DATE1_INVALID" || dateStr2 === "DATE2_INVALID") return false;
  return dateStr1 === dateStr2;
}

/**
 * Safely check if a string or date value starts with a target string.
 */
export function safeStartsWith(val, prefix) {
  if (val === null || val === undefined) return false;
  if (typeof val === "string") {
    return val.startsWith(prefix);
  }
  const dateStr = formatDate(val, "");
  return dateStr ? dateStr.startsWith(prefix) : false;
}

/**
 * Safely stringify any value to avoid undefined.startsWith, null.toLowerCase, etc.
 */
export function safeString(val, fallback = "") {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") return val;
  return String(val);
}
