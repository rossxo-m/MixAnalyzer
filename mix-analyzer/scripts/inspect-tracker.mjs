import XLSX from "xlsx";
const wb = XLSX.readFile("mix-analyzer-tracker.xlsx");
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const ref = ws["!ref"];
  console.log(`\n=== ${name}  ref=${ref}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  rows.forEach((r, i) => console.log(String(i + 1).padStart(3), (r[0] ?? "") + "|" + (r[2] ?? "").toString().slice(0,60)));
  console.log(`total rows: ${rows.length}`);
}
