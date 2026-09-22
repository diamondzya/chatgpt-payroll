# Update summary

## Requested feature changes

- Monthly-paid employees now get automatic compensation reference rates while editing an employee:
  - Daily rate = Monthly Basic × 12 ÷ Annual-Day Divisor
  - Hourly rate = Daily Rate ÷ Normal Hours Per Day
  - Weekly reference rate = Monthly Basic × 12 ÷ 52
- The calculated rate fields update live when monthly salary, divisor, normal hours, or salary basis changes.
- The same monthly-rate derivation is enforced again on save so stale/manual values cannot be stored accidentally.

- Attendance now includes **Generate custom dates**:
  - Choose one employee or all active employees.
  - Choose any From / To date range up to 62 days.
  - Choose attendance status and default clock/break values.
  - Optionally skip each employee's rest days.
  - Existing employee/date attendance is skipped instead of overwritten.
  - Inactive dates are skipped automatically.

- Payslips now show attendance adjustments as separate lines:
  - Late
  - Undertime
  - Absence
  These values are clearly marked as already reflected in earned basic pay so they are not double-deducted.

## UI refresh

- Dark enterprise sidebar with blue active navigation.
- Updated blue/neutral professional color system.
- Refined panels, cards, buttons, inputs, tables, dialogs, focus states, shadows, and mobile behavior.
- Added automatic-rate information card and read-only styling for system-calculated rate fields.
- Improved payslip/report visual hierarchy.

## Validation

- JavaScript syntax checks passed.
- Existing automated payroll suite passed: 26/26 tests.
