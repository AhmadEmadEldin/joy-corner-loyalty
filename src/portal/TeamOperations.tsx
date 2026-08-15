import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  createCleaningTask,
  createTeamMember,
  createTeamPosition,
  createTeamShift,
  deleteCleaningTask,
  deleteTeamShift,
  loadTeamOperations,
  savePayrollOverride,
  updateCleaningTask,
  updateTeamMember,
  updateShiftAttendance,
  type TeamMember,
  type TeamOperationsData,
  type TeamShift,
  type PayrollOverride,
} from "./repository";

const DEFAULT_CLEANING = [
  "Disinfect toilet",
  "Clean sink and taps",
  "Clean mirror",
  "Sweep and mop floor",
  "Empty trash",
  "Refill soap",
  "Refill tissue",
  "Check odor and ventilation",
  "Final inspection",
];
const money = new Intl.NumberFormat("en-EG", {
  currency: "EGP",
  style: "currency",
});
const iso = (date: Date) => date.toISOString().slice(0, 10);
function mondayOf(date: Date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  next.setHours(12, 0, 0, 0);
  return next;
}
function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}
function formObject(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries());
}
function calculatePay(
  row: TeamOperationsData["payroll"][number],
  employee?: TeamMember,
  override?: PayrollOverride,
) {
  const hours = Number(override?.manual_hours ?? row.worked_hours ?? 0);
  const days = Number(override?.manual_days ?? row.days_worked ?? 0);
  const rate = Number(row.pay_rate || 0);
  let basePay = rate;
  if (row.pay_type === "daily") basePay = days * rate;
  if (row.pay_type === "hourly") {
    const regularLimit = Number(employee?.max_weekly_hours || 40);
    const regular = Math.min(hours, regularLimit);
    basePay =
      regular * rate +
      Math.max(hours - regularLimit, 0) *
        rate *
        Number(row.overtime_multiplier || 1.5);
  }
  return Math.max(
    basePay + Number(override?.bonus || 0) - Number(override?.deduction || 0),
    0,
  );
}

function EmployeeIdentity({
  employee,
  compact = false,
}: {
  employee?: TeamMember;
  compact?: boolean;
}) {
  if (!employee)
    return <span className="employee-identity missing">Unassigned</span>;
  return (
    <div
      className={`employee-identity${compact ? " compact" : ""}`}
      style={{ "--employee-color": employee.calendar_color } as CSSProperties}
    >
      <span className="employee-identity-avatar">
        {employee.full_name
          .split(" ")
          .map((part) => part[0])
          .slice(0, 2)
          .join("")}
      </span>
      <span className="employee-identity-copy">
        <strong>{employee.full_name}</strong>
        <small>{employee.position_name || "Team member"}</small>
      </span>
    </div>
  );
}

export function TeamOperations({
  onError,
}: {
  onError: (message: string) => void;
}) {
  const [section, setSection] = useState<
    "team" | "schedule" | "cleaning" | "payroll"
  >("team");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [data, setData] = useState<TeamOperationsData | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<TeamMember | null>(
    null,
  );
  const [editingAttendance, setEditingAttendance] = useState<TeamShift | null>(
    null,
  );
  const [editingPayroll, setEditingPayroll] = useState<TeamMember | null>(null);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(() =>
    iso(new Date()),
  );
  const [selectedScheduleEmployee, setSelectedScheduleEmployee] = useState("");
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await loadTeamOperations(iso(weekStart), iso(weekEnd)));
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Could not load team operations.",
      );
    } finally {
      setBusy(false);
    }
  }, [onError, weekEnd, weekStart]);
  useEffect(() => {
    void load();
  }, [load]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: (input: Record<string, unknown>) => Promise<unknown>,
  ) {
    event.preventDefault();
    setBusy(true);
    try {
      await action(formObject(event.currentTarget));
      event.currentTarget.reset();
      await load();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "The change could not be saved.",
      );
      setBusy(false);
    }
  }
  function shiftWeek(amount: number) {
    setWeekStart((current) => {
      const next = addDays(current, amount * 7);
      setSelectedScheduleDate(iso(next));
      return next;
    });
  }
  function printSheet(title: string, body: string) {
    const popup = window.open("", "_blank", "width=1200,height=850");
    if (!popup) return onError("Allow pop-ups to print this Joy Corner sheet.");
    popup.opener = null;
    popup.document
      .write(`<!doctype html><html><head><title>${title}</title><style>
      @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:13px Arial;color:#2b2117;background:#fffaf0}
      header{border-bottom:4px solid #e0aa38;display:flex;justify-content:space-between;align-items:end;padding-bottom:10px}
      h1,h2{font-family:Georgia;color:#5b381d;margin:0 0 5px}.brand{color:#b67b20;font-weight:800;letter-spacing:.12em}
      table{border-collapse:collapse;margin-top:18px;width:100%}th{background:#2a1b10;color:#f8e9c8}th,td{border:1px solid #bda77f;padding:9px;vertical-align:top}
      .shift{border-left:5px solid var(--c);background:#fff;padding:7px;margin:4px 0;border-radius:5px}.notes{border:1px solid #bda77f;min-height:75px;margin-top:15px;padding:12px}
      @media print{button{display:none}}
    </style></head><body><header><div><div class="brand">JOY CORNER</div><h1>${title}</h1><span>${iso(weekStart)} — ${iso(weekEnd)}</span></div><img src="/assets/joy-corner-logo-mark.png" width="65"></header>${body}<div class="notes"><b>Weekly notes</b><br><br></div><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }
  function printSchedule() {
    if (!data) return;
    printSheet(
      "Weekly Team Schedule",
      `<table><thead><tr>${days.map((d) => `<th>${d.toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" })}</th>`).join("")}</tr></thead><tbody><tr>${days
        .map(
          (d) =>
            `<td>${
              data.shifts
                .filter((s) => s.shift_date.slice(0, 10) === iso(d))
                .map(
                  (s) =>
                    `<div class="shift" style="--c:${s.color}"><b>${s.full_name}</b><br>${s.scheduled_start.slice(0, 5)}–${s.scheduled_end.slice(0, 5)}<br><small>${s.position_name || "Team"}${s.notes ? ` · ${s.notes}` : ""}</small></div>`,
                )
                .join("") || "—"
            }</td>`,
        )
        .join("")}</tr></tbody></table>`,
    );
  }
  function printCleaning() {
    if (!data) return;
    printSheet(
      "Bathroom Cleaning Planner",
      `<table><thead><tr><th>Date / time</th><th>Area</th><th>Employee</th><th>Checklist</th><th>Initials</th><th>Manager</th></tr></thead><tbody>${data.cleaning.map((task) => `<tr><td>${task.task_date.slice(0, 10)}<br>${task.task_time.slice(0, 5)}</td><td>${task.area}</td><td>${task.full_name || "Unassigned"}</td><td>${task.checklist.map((item) => `□ ${item}`).join("<br>")}</td><td></td><td></td></tr>`).join("")}</tbody></table>`,
    );
  }
  function printPayroll() {
    if (!data) return;
    printSheet(
      "Weekly Payroll Summary",
      `<table><thead><tr><th>Employee</th><th>Position</th><th>Pay type</th><th>Days worked</th><th>Approved hours</th><th>Overtime</th><th>Estimated salary</th><th>Signature</th></tr></thead><tbody>${data.payroll
        .map((row) => {
          const employee = data.employees.find((item) => item.id === row.id);
          const override = data.payrollOverrides.find(
            (item) => item.employee_id === row.id,
          );
          const hours = Number(override?.manual_hours ?? row.worked_hours ?? 0);
          const daysWorked = Number(
            override?.manual_days ?? row.days_worked ?? 0,
          );
          const overtime = Math.max(
            hours - Number(employee?.max_weekly_hours || 40),
            0,
          );
          return `<tr><td><b>${row.full_name}</b></td><td>${employee?.position_name || "Team"}</td><td>${row.pay_type}</td><td>${daysWorked}</td><td>${hours.toFixed(2)}</td><td>${overtime.toFixed(2)}</td><td><b>${money.format(calculatePay(row, employee, override))}</b></td><td></td></tr>`;
        })
        .join("")}</tbody></table>`,
    );
  }
  if (!data)
    return (
      <section className="portal-section">
        <p>{busy ? "Loading team operations…" : "No team data available."}</p>
      </section>
    );
  const selectedDayShifts = data.shifts.filter(
    (shift) => shift.shift_date.slice(0, 10) === selectedScheduleDate,
  );
  const workingEmployeeIds = new Set(
    selectedDayShifts.map((shift) => shift.employee_id),
  );
  const workingEmployees = data.employees.filter((employee) =>
    workingEmployeeIds.has(employee.id),
  );
  const offEmployees = data.employees.filter(
    (employee) => !workingEmployeeIds.has(employee.id),
  );
  return (
    <section className="portal-section team-operations">
      <header className="team-operations-header">
        <div>
          <p className="eyebrow">Owner workspace</p>
          <h2>Team & Operations</h2>
          <p className="muted">
            People, schedules, cleaning, worked hours and salary in one place.
          </p>
        </div>
        <div className="week-control">
          <button onClick={() => shiftWeek(-1)} type="button">
            ←
          </button>
          <strong>
            {iso(weekStart)} — {iso(weekEnd)}
          </strong>
          <button onClick={() => shiftWeek(1)} type="button">
            →
          </button>
        </div>
      </header>
      <nav className="operations-tabs" aria-label="Team operations sections">
        {(["team", "schedule", "cleaning", "payroll"] as const).map((name) => (
          <button
            aria-pressed={section === name}
            className={section === name ? "active" : ""}
            key={name}
            onClick={() => setSection(name)}
            type="button"
          >
            {name}
          </button>
        ))}
      </nav>
      {section === "team" ? (
        <div className="operations-layout">
          <div>
            <div className="team-card-grid">
              {data.employees.map((employee) => (
                <article
                  className="team-member-card"
                  key={employee.id}
                  style={{ borderTopColor: employee.calendar_color }}
                >
                  <EmployeeIdentity employee={employee} />
                  <dl>
                    <div>
                      <dt>Phone</dt>
                      <dd>{employee.phone || "—"}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{employee.email || "—"}</dd>
                    </div>
                    <div>
                      <dt>Pay</dt>
                      <dd>
                        {money.format(Number(employee.pay_rate))} /{" "}
                        {employee.pay_type}
                      </dd>
                    </div>
                    <div>
                      <dt>ID</dt>
                      <dd>
                        {employee.government_id_last4
                          ? `•••• ${employee.government_id_last4}`
                          : "Not stored"}
                      </dd>
                    </div>
                  </dl>
                  <button
                    className="button-secondary team-edit-button"
                    onClick={() => setEditingEmployee(employee)}
                    type="button"
                  >
                    Edit employee
                  </button>
                </article>
              ))}
            </div>
          </div>
          <aside className="operations-form-stack">
            <form onSubmit={(e) => void submit(e, createTeamMember)}>
              <h3>Add employee</h3>
              <input name="fullName" placeholder="Full name" required />
              <input name="phone" placeholder="Phone" />
              <input name="email" placeholder="Email" type="email" />
              <input name="address" placeholder="Address" />
              <input name="emergencyContact" placeholder="Emergency contact" />
              <input
                name="governmentId"
                placeholder="National ID (last 4 stored)"
              />
              <select name="positionId">
                <option value="">Select position</option>
                {data.positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="form-pair">
                <select name="payType">
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="fixed">Fixed</option>
                </select>
                <input
                  min="0"
                  name="payRate"
                  placeholder="Rate EGP"
                  step="0.01"
                  type="number"
                />
              </div>
              <button disabled={busy}>Add employee</button>
            </form>
            <form onSubmit={(e) => void submit(e, createTeamPosition)}>
              <h3>Add position</h3>
              <input name="name" placeholder="Position name" required />
              <div className="form-pair">
                <input name="color" type="color" defaultValue="#e0aa38" />
                <input
                  min="0"
                  name="defaultHourlyRate"
                  placeholder="Default rate"
                  type="number"
                />
              </div>
              <button disabled={busy}>Add position</button>
            </form>
          </aside>
        </div>
      ) : null}
      {section === "schedule" ? (
        <>
          <div className="section-actions">
            <div className="schedule-day-title">
              <span>Staffing for</span>
              <strong>
                {new Date(
                  `${selectedScheduleDate}T12:00:00`,
                ).toLocaleDateString("en", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </strong>
            </div>
            <button onClick={printSchedule} type="button">
              Print colorful schedule
            </button>
          </div>
          <div className="daily-staffing-board">
            <section className="staffing-group working">
              <header>
                <div>
                  <p className="eyebrow">Working</p>
                  <h3>On schedule</h3>
                </div>
                <strong>{workingEmployees.length}</strong>
              </header>
              <div className="staffing-employee-grid">
                {workingEmployees.length ? (
                  workingEmployees.map((employee) => (
                    <button
                      key={employee.id}
                      onClick={() => setSelectedScheduleEmployee(employee.id)}
                      type="button"
                    >
                      <EmployeeIdentity employee={employee} />
                      <small>
                        {selectedDayShifts
                          .filter((shift) => shift.employee_id === employee.id)
                          .map(
                            (shift) =>
                              `${shift.scheduled_start.slice(0, 5)}–${shift.scheduled_end.slice(0, 5)}`,
                          )
                          .join(" · ")}
                      </small>
                    </button>
                  ))
                ) : (
                  <p className="muted">No employees scheduled yet.</p>
                )}
              </div>
            </section>
            <section className="staffing-group off">
              <header>
                <div>
                  <p className="eyebrow">Available</p>
                  <h3>Off today</h3>
                </div>
                <strong>{offEmployees.length}</strong>
              </header>
              <div className="staffing-employee-grid">
                {offEmployees.map((employee) => (
                  <button
                    className={
                      selectedScheduleEmployee === employee.id ? "selected" : ""
                    }
                    key={employee.id}
                    onClick={() => setSelectedScheduleEmployee(employee.id)}
                    type="button"
                  >
                    <EmployeeIdentity employee={employee} />
                    <small>Click to add a shift</small>
                  </button>
                ))}
              </div>
            </section>
          </div>
          <div className="weekly-calendar">
            {days.map((day) => (
              <section
                className={
                  selectedScheduleDate === iso(day) ? "selected-day" : ""
                }
                key={iso(day)}
              >
                <button
                  className="calendar-day-header"
                  onClick={() => setSelectedScheduleDate(iso(day))}
                  type="button"
                >
                  <strong>
                    {day.toLocaleDateString("en", { weekday: "long" })}
                  </strong>
                  <small>{day.toLocaleDateString()}</small>
                  <span>
                    {
                      data.shifts.filter(
                        (shift) => shift.shift_date.slice(0, 10) === iso(day),
                      ).length
                    }{" "}
                    shifts
                  </span>
                </button>
                {data.shifts
                  .filter((s) => s.shift_date.slice(0, 10) === iso(day))
                  .map((shift) => (
                    <article
                      className="calendar-shift"
                      key={shift.id}
                      style={{ borderColor: shift.color }}
                    >
                      <EmployeeIdentity
                        compact
                        employee={data.employees.find(
                          (employee) => employee.id === shift.employee_id,
                        )}
                      />
                      <span>
                        {shift.scheduled_start.slice(0, 5)}–
                        {shift.scheduled_end.slice(0, 5)}
                      </span>
                      <button
                        onClick={() => setEditingAttendance(shift)}
                        type="button"
                      >
                        {shift.approved ? "✓ Edit attendance" : "Record hours"}
                      </button>
                      <button
                        className="shift-remove"
                        onClick={() => {
                          if (
                            window.confirm(`Remove ${shift.full_name}'s shift?`)
                          )
                            void deleteTeamShift(shift.id)
                              .then(load)
                              .catch((e: Error) => onError(e.message));
                        }}
                        type="button"
                      >
                        Remove
                      </button>
                    </article>
                  ))}
              </section>
            ))}
          </div>
          <form
            className="inline-operation-form"
            onSubmit={(e) => void submit(e, createTeamShift)}
          >
            <h3>Add custom shift</h3>
            <select
              name="employeeId"
              onChange={(event) =>
                setSelectedScheduleEmployee(event.target.value)
              }
              required
              value={selectedScheduleEmployee}
            >
              <option value="">Employee</option>
              {data.employees.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <select name="positionId">
              <option value="">Position</option>
              {data.positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              min={iso(weekStart)}
              max={iso(weekEnd)}
              name="shiftDate"
              onChange={(event) => setSelectedScheduleDate(event.target.value)}
              required
              type="date"
              value={selectedScheduleDate}
            />
            <input name="start" required type="time" />
            <input name="end" required type="time" />
            <input
              min="0"
              name="breakMinutes"
              placeholder="Break minutes"
              type="number"
            />
            <input name="notes" placeholder="Shift note" />
            <button disabled={busy}>Add shift</button>
          </form>
        </>
      ) : null}
      {section === "cleaning" ? (
        <>
          <div className="section-actions">
            <button onClick={printCleaning} type="button">
              Print cleaning planner
            </button>
          </div>
          <div className="cleaning-list">
            {data.cleaning.map((task) => (
              <article key={task.id}>
                <div>
                  <strong>{task.area}</strong>
                  <span>
                    {task.task_date.slice(0, 10)} · {task.task_time.slice(0, 5)}
                  </span>
                </div>
                <EmployeeIdentity
                  compact
                  employee={data.employees.find(
                    (employee) => employee.id === task.employee_id,
                  )}
                />
                <small>{task.checklist.length} cleaning checks</small>
                <button
                  className={
                    task.completed_at
                      ? "cleaning-complete completed"
                      : "cleaning-complete"
                  }
                  onClick={() =>
                    void updateCleaningTask(task.id, {
                      completed: !task.completed_at,
                      employeeInitials: "",
                      managerVerified: !task.completed_at,
                      notes: task.notes,
                    })
                      .then(load)
                      .catch((e: Error) => onError(e.message))
                  }
                  type="button"
                >
                  {task.completed_at ? "✓ Completed" : "Mark complete"}
                </button>
                <button
                  className="button-danger cleaning-remove"
                  onClick={() => {
                    if (window.confirm("Remove this cleaning round?"))
                      void deleteCleaningTask(task.id)
                        .then(load)
                        .catch((e: Error) => onError(e.message));
                  }}
                  type="button"
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
          <form
            className="inline-operation-form"
            onSubmit={(e) =>
              void submit(e, (input) =>
                createCleaningTask({ ...input, checklist: DEFAULT_CLEANING }),
              )
            }
          >
            <h3>Add bathroom round</h3>
            <input name="area" defaultValue="Bathroom" required />
            <select name="employeeId">
              <option value="">Unassigned</option>
              {data.employees.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <input
              min={iso(weekStart)}
              max={iso(weekEnd)}
              name="taskDate"
              required
              type="date"
            />
            <input name="taskTime" required type="time" />
            <input name="notes" placeholder="Cleaning note" />
            <button disabled={busy}>Add cleaning round</button>
          </form>
        </>
      ) : null}
      {section === "payroll" ? (
        <>
          <div className="section-actions">
            <button onClick={printPayroll} type="button">
              Print payroll summary
            </button>
          </div>
          <div className="payroll-notice">
            <strong>Salary uses approved actual work.</strong>
            <span>
              Approve each completed shift in the schedule. Unapproved planned
              hours are not paid.
            </span>
          </div>
          <div className="payroll-grid">
            {data.payroll.map((row) => {
              const employee = data.employees.find(
                (item) => item.id === row.id,
              );
              const override = data.payrollOverrides.find(
                (item) => item.employee_id === row.id,
              );
              const hours = Number(
                override?.manual_hours ?? row.worked_hours ?? 0,
              );
              const daysWorked = Number(
                override?.manual_days ?? row.days_worked ?? 0,
              );
              const overtime = Math.max(
                hours - Number(employee?.max_weekly_hours || 40),
                0,
              );
              return (
                <article
                  className={
                    override ? "payroll-card adjusted" : "payroll-card"
                  }
                  key={row.id}
                  style={
                    {
                      "--employee-color": employee?.calendar_color,
                    } as CSSProperties
                  }
                >
                  <EmployeeIdentity employee={employee} />
                  <div>
                    <b>{daysWorked}</b>
                    <small>days worked</small>
                  </div>
                  <div>
                    <b>{hours.toFixed(2)}</b>
                    <small>approved hours</small>
                  </div>
                  <div>
                    <b>{overtime.toFixed(2)}</b>
                    <small>overtime hours</small>
                  </div>
                  <footer>
                    <span>
                      {override ? "Owner-adjusted salary" : "Estimated salary"}
                    </span>
                    <strong>
                      {money.format(calculatePay(row, employee, override))}
                    </strong>
                  </footer>
                  {override?.note ? (
                    <p className="payroll-adjustment-note">{override.note}</p>
                  ) : null}
                  <button
                    className="button-secondary payroll-edit-button"
                    disabled={!employee}
                    onClick={() => employee && setEditingPayroll(employee)}
                    type="button"
                  >
                    Adjust payroll
                  </button>
                </article>
              );
            })}
          </div>
        </>
      ) : null}
      {editingEmployee ? (
        <div className="operations-modal-backdrop" role="presentation">
          <form
            className="operations-modal"
            onSubmit={(event) => {
              event.preventDefault();
              const employeeId = editingEmployee.id;
              void updateTeamMember(employeeId, formObject(event.currentTarget))
                .then(async () => {
                  setEditingEmployee(null);
                  await load();
                })
                .catch((error: Error) => onError(error.message));
            }}
          >
            <header>
              <div>
                <p className="eyebrow">Employee record</p>
                <h3>Edit {editingEmployee.full_name}</h3>
              </div>
              <button
                aria-label="Close"
                onClick={() => setEditingEmployee(null)}
                type="button"
              >
                ×
              </button>
            </header>
            <div className="operations-modal-grid">
              <label>
                Full name
                <input
                  defaultValue={editingEmployee.full_name}
                  name="fullName"
                  required
                />
              </label>
              <label>
                Position
                <select
                  defaultValue={editingEmployee.position_id || ""}
                  name="positionId"
                >
                  <option value="">No position</option>
                  {data.positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Phone
                <input
                  defaultValue={editingEmployee.phone || ""}
                  name="phone"
                />
              </label>
              <label>
                Email
                <input
                  defaultValue={editingEmployee.email || ""}
                  name="email"
                  type="email"
                />
              </label>
              <label className="wide">
                Address
                <input defaultValue={editingEmployee.address} name="address" />
              </label>
              <label className="wide">
                Emergency contact
                <input
                  defaultValue={editingEmployee.emergency_contact}
                  name="emergencyContact"
                />
              </label>
              <label>
                Pay type
                <select defaultValue={editingEmployee.pay_type} name="payType">
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="fixed">Fixed</option>
                </select>
              </label>
              <label>
                Pay rate
                <input
                  defaultValue={editingEmployee.pay_rate}
                  min="0"
                  name="payRate"
                  step="0.01"
                  type="number"
                />
              </label>
              <label>
                Regular weekly hours
                <input
                  defaultValue={editingEmployee.max_weekly_hours}
                  min="1"
                  name="maxWeeklyHours"
                  type="number"
                />
              </label>
              <label>
                Overtime multiplier
                <input
                  defaultValue={editingEmployee.overtime_multiplier}
                  min="1"
                  name="overtimeMultiplier"
                  step="0.1"
                  type="number"
                />
              </label>
              <label>
                Calendar color
                <input
                  defaultValue={editingEmployee.calendar_color}
                  name="calendarColor"
                  type="color"
                />
              </label>
              <label>
                Status
                <select defaultValue={editingEmployee.status} name="status">
                  <option value="active">Active</option>
                  <option value="on_leave">On leave</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label className="wide">
                Private owner notes
                <textarea
                  defaultValue={editingEmployee.private_notes}
                  name="privateNotes"
                  rows={3}
                />
              </label>
            </div>
            <footer>
              <button
                className="button-secondary"
                onClick={() => setEditingEmployee(null)}
                type="button"
              >
                Cancel
              </button>
              <button disabled={busy}>Save employee</button>
            </footer>
          </form>
        </div>
      ) : null}
      {editingAttendance ? (
        <div className="operations-modal-backdrop" role="presentation">
          <form
            className="operations-modal attendance-modal"
            onSubmit={(event) => {
              event.preventDefault();
              const shiftId = editingAttendance.id;
              void updateShiftAttendance(
                shiftId,
                formObject(event.currentTarget),
              )
                .then(async () => {
                  setEditingAttendance(null);
                  await load();
                })
                .catch((error: Error) => onError(error.message));
            }}
          >
            <header>
              <div>
                <p className="eyebrow">Actual attendance</p>
                <h3>{editingAttendance.full_name}</h3>
                <span>{editingAttendance.shift_date.slice(0, 10)}</span>
              </div>
              <button
                aria-label="Close"
                onClick={() => setEditingAttendance(null)}
                type="button"
              >
                ×
              </button>
            </header>
            <div className="operations-modal-grid">
              <label>
                Status
                <select
                  defaultValue={
                    editingAttendance.attendance_status === "scheduled"
                      ? "worked"
                      : editingAttendance.attendance_status
                  }
                  name="status"
                >
                  <option value="worked">Worked</option>
                  <option value="absent">Absent</option>
                  <option value="paid_leave">Paid leave</option>
                  <option value="unpaid_leave">Unpaid leave</option>
                </select>
              </label>
              <label>
                Actual start
                <input
                  defaultValue={(
                    editingAttendance.actual_start ||
                    editingAttendance.scheduled_start
                  ).slice(0, 5)}
                  name="actualStart"
                  type="time"
                />
              </label>
              <label>
                Actual end
                <input
                  defaultValue={(
                    editingAttendance.actual_end ||
                    editingAttendance.scheduled_end
                  ).slice(0, 5)}
                  name="actualEnd"
                  type="time"
                />
              </label>
              <label>
                Actual break minutes
                <input
                  defaultValue={
                    editingAttendance.actual_break_minutes ??
                    editingAttendance.break_minutes
                  }
                  min="0"
                  name="actualBreakMinutes"
                  type="number"
                />
              </label>
              <label className="approval-check wide">
                <input
                  defaultChecked
                  name="approved"
                  type="checkbox"
                  value="true"
                />
                Approve these hours for payroll
              </label>
            </div>
            <footer>
              <button
                className="button-secondary"
                onClick={() => setEditingAttendance(null)}
                type="button"
              >
                Cancel
              </button>
              <button>Save attendance</button>
            </footer>
          </form>
        </div>
      ) : null}
      {editingPayroll
        ? (() => {
            const row = data.payroll.find(
              (item) => item.id === editingPayroll.id,
            );
            const override = data.payrollOverrides.find(
              (item) => item.employee_id === editingPayroll.id,
            );
            if (!row) return null;
            return (
              <div className="operations-modal-backdrop" role="presentation">
                <form
                  className="operations-modal payroll-adjustment-modal"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const employeeId = editingPayroll.id;
                    void savePayrollOverride(employeeId, {
                      ...formObject(event.currentTarget),
                      periodStart: iso(weekStart),
                      periodEnd: iso(weekEnd),
                    })
                      .then(async () => {
                        setEditingPayroll(null);
                        await load();
                      })
                      .catch((error: Error) => onError(error.message));
                  }}
                >
                  <header>
                    <div>
                      <p className="eyebrow">Owner payroll correction</p>
                      <EmployeeIdentity employee={editingPayroll} />
                    </div>
                    <button
                      aria-label="Close"
                      onClick={() => setEditingPayroll(null)}
                      type="button"
                    >
                      ×
                    </button>
                  </header>
                  <p className="muted">
                    Leave days or hours empty to use the approved automatic
                    count.
                  </p>
                  <div className="operations-modal-grid">
                    <label>
                      Manual days
                      <input
                        defaultValue={override?.manual_days ?? ""}
                        min="0"
                        name="manualDays"
                        placeholder={`Automatic: ${row.days_worked}`}
                        step="0.5"
                        type="number"
                      />
                    </label>
                    <label>
                      Manual hours
                      <input
                        defaultValue={override?.manual_hours ?? ""}
                        min="0"
                        name="manualHours"
                        placeholder={`Automatic: ${row.worked_hours}`}
                        step="0.25"
                        type="number"
                      />
                    </label>
                    <label>
                      Bonus (EGP)
                      <input
                        defaultValue={override?.bonus ?? 0}
                        min="0"
                        name="bonus"
                        step="0.01"
                        type="number"
                      />
                    </label>
                    <label>
                      Deduction (EGP)
                      <input
                        defaultValue={override?.deduction ?? 0}
                        min="0"
                        name="deduction"
                        step="0.01"
                        type="number"
                      />
                    </label>
                    <label className="wide">
                      Reason or note
                      <textarea
                        defaultValue={override?.note || ""}
                        name="note"
                        rows={3}
                      />
                    </label>
                  </div>
                  <footer>
                    <button
                      className="button-secondary"
                      onClick={() => setEditingPayroll(null)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button>Save payroll adjustment</button>
                  </footer>
                </form>
              </div>
            );
          })()
        : null}
    </section>
  );
}
