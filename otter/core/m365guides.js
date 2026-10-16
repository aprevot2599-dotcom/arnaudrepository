// Built-in coaching for Microsoft Power Automate, Forms and Excel. Answered locally (0 tokens)
// as checklists. Button names follow the web versions of these apps as of 2025-2026; Microsoft
// renames things often, so every guide ends with a reminder that a screen snapshot can check
// the current layout. O.T.T.E.R. only explains: it never clicks or changes anything.

export const GUIDES = [
  {
    id: "pa-forms-to-excel", app: "Power Automate", title: "Save each Microsoft Forms response as a new Excel row",
    match: /(form|survey).*(excel|spreadsheet|row|table)|(excel|spreadsheet).*(form|survey)|forms? to excel/i,
    before: ["The Excel file is stored in OneDrive or SharePoint (not on your desktop).", "The data has a header row and is formatted as a table: select the headers and data, then Insert > Table (or Ctrl+T). Name it under Table Design > Table Name, for example tblResponses."],
    steps: [
      "Go to make.powerautomate.com and sign in.",
      "Select + Create, then Automated cloud flow.",
      "Name the flow, search the trigger list for \"When a new response is submitted\" (Microsoft Forms), select it, then Create.",
      "In the trigger, pick your form in Form Id.",
      "Add an action (the + under the trigger, or + New step in the classic designer): Microsoft Forms > Get response details. Choose the same Form Id; for Response Id, pick Response Id from the dynamic content list.",
      "Add an action: Excel Online (Business) > Add a row into a table. Choose Location, Document Library, File, then Table.",
      "Each table column now shows a box: fill each one from dynamic content (the matching form question).",
      "Select Save, then Test > Manually > Test, and submit a test response to the form.",
      "Open the flow's run history (28-day run history on the flow's page) and confirm the run succeeded and the row appeared.",
    ],
    gotchas: ["If a column name in Excel changes, re-map it in the flow or rows land empty.", "Group forms (owned by a team) appear under the group, not under your forms.", "Date answers come through as text like 2026-10-16; set the Excel column's format if you need dates."],
  },
  {
    id: "pa-approval", app: "Power Automate", title: "Route something for approval and act on the answer",
    match: /approv(al|e) (flow|process|workflow)|send .* for approval|start and wait/i,
    before: ["Know who approves (a person or several) and what should happen after Approve and after Reject."],
    steps: [
      "make.powerautomate.com > + Create > choose the trigger that starts it (for example Automated cloud flow from a form response, or Instant cloud flow with a button).",
      "Add an action: Approvals > Start and wait for an approval.",
      "Approval type: Approve/Reject - First to respond (one approver) or Everyone must approve. Fill Title, Assigned to, and Details (add dynamic content so the approver sees what they're approving).",
      "Add an action: Control > Condition. Left box: Outcome (dynamic content). Operator: is equal to. Right box: Approve.",
      "Under True, add what happens when approved (for example Office 365 Outlook > Send an email (V2) to the requester).",
      "Under False, add what happens when rejected, including the approver's Comments.",
      "Save, test once with yourself as approver, and watch the request arrive in Outlook or the Teams Approvals app.",
    ],
    gotchas: ["Approvals wait up to 30 days, then the flow times out.", "Everyone must approve returns a single Outcome only after all respond."],
  },
  {
    id: "pa-schedule", app: "Power Automate", title: "Send a reminder on a schedule",
    match: /(remind|reminder|schedul|every (week|month|monday|day)|recurr)/i,
    before: ["Decide the day, time and time zone, and who gets the reminder."],
    steps: [
      "make.powerautomate.com > + Create > Scheduled cloud flow.",
      "Name it; set Starting, Repeat every (for example 1 Week) and the day; Create.",
      "Open the Recurrence trigger, show advanced options, and set the Time zone (Pacific Time for Oregon).",
      "Add an action: Office 365 Outlook > Send an email (V2), or Microsoft Teams > Post message in a chat or channel.",
      "Fill To, Subject and Body. Save, then Test > Manually to see one arrive.",
    ],
    gotchas: ["Without a time zone the schedule runs on UTC, which is 7 or 8 hours off."],
  },
  {
    id: "pa-fix-run", app: "Power Automate", title: "Find out why a flow failed",
    match: /(flow|power automate).*(fail|error|broke|didn'?t run|not working)|fail(ed)? (run|flow)/i,
    before: [],
    steps: [
      "make.powerautomate.com > My flows > select the flow.",
      "In 28-day run history, select a run marked Failed.",
      "The failed step has a red mark. Open it and read the error; Show raw outputs has the full message.",
      "Common causes: an expired connection (fix under Data > Connections, then re-run), a renamed column or file, a missing value in dynamic content, or too many runs at once.",
      "After fixing, use Resubmit on the failed run to retry it with the same input.",
    ],
    gotchas: ["A flow turned off after repeated failures must be turned back on from the flow page."],
  },
  {
    id: "forms-build", app: "Microsoft Forms", title: "Build a form with branching and the right settings",
    match: /(build|create|make|new).*(form|survey)|branching|skip logic/i,
    before: ["List your questions and which answers should skip to which questions."],
    steps: [
      "Go to forms.office.com > New Form. Add a title and description.",
      "Add questions with + Add new: Choice, Text, Rating, Date, Ranking, Likert, Upload file, Net Promoter Score.",
      "Mark required questions with the Required switch.",
      "For branching: on a question, select ... (More settings) > Add branching, then choose where each answer goes.",
      "Settings (the ... menu at top > Settings): who can respond (only people in your organization, or anyone), one response per person, start and end date, and Get email notification of each response.",
      "Preview on computer and mobile, then Collect responses: copy the link, QR code, or embed code.",
    ],
    gotchas: ["Branching works on Choice questions; plan the order before adding branches.", "Anyone can respond means no sign-in, so you can't limit one response per person."],
  },
  {
    id: "forms-excel-sync", app: "Microsoft Forms", title: "See Forms responses in Excel",
    match: /forms? (responses?|results?).*(excel|spreadsheet)|open (results|responses) in excel/i,
    before: [],
    steps: [
      "Open the form > Responses tab > Open results in Excel (or View responses in Excel).",
      "Forms created from Excel for the web (Insert > Forms > New Form) update the workbook live as responses arrive.",
      "Other forms give you a downloaded copy that doesn't update; use the Power Automate Forms-to-Excel flow for a live table.",
    ],
    gotchas: [],
  },
  {
    id: "xl-xlookup", app: "Excel", title: "Look up a value from another table (XLOOKUP)",
    match: /xlookup|vlookup|look ?up|match .* (from|in) another (sheet|table)/i,
    before: ["Both lists share a key column (an ID, course code or name spelled the same way)."],
    steps: [
      "Click the cell where the answer should go.",
      "Type =XLOOKUP( then click the key in this row, type a comma.",
      "Select the key column in the other table, comma.",
      "Select the column you want back, comma, then type \"Not found\" and close with ).",
      "Press Enter, then double-click the fill handle to copy it down.",
    ],
    example: "=XLOOKUP(A2, Courses[Code], Courses[Fee], \"Not found\")",
    gotchas: ["Extra spaces break matches: wrap keys in TRIM().", "Numbers stored as text won't match numbers: look for the green triangle and Convert to Number."],
  },
  {
    id: "xl-pivot", app: "Excel", title: "Summarize data with a PivotTable",
    match: /pivot|summari[sz]e (by|the data)|totals? by (center|program|month|course)/i,
    before: ["Your data has one header row and no blank rows or columns."],
    steps: [
      "Click anywhere in the data.",
      "Insert > PivotTable > From Table/Range > New Worksheet > OK.",
      "In the PivotTable Fields pane, drag a category (for example Center) to Rows.",
      "Drag a number (for example Enrollments or Revenue) to Values. It sums by default.",
      "To count instead, click the value field > Value Field Settings > Count.",
      "When source data changes, right-click the PivotTable > Refresh.",
    ],
    gotchas: ["A PivotTable doesn't update by itself: refresh it."],
  },
  {
    id: "xl-dropdown", app: "Excel", title: "Add a drop-down list to cells",
    match: /drop[ -]?down|data validation|pick[ -]?list/i,
    before: ["Type the allowed choices somewhere (another sheet works well)."],
    steps: [
      "Select the cells that should have the drop-down.",
      "Data > Data Validation.",
      "Allow: List. Source: select the choices range (or type them separated by commas).",
      "Optional: Error Alert tab to block other entries. OK.",
    ],
    gotchas: [],
  },
  {
    id: "xl-totals", app: "Excel", title: "Find out why a total doesn't add up",
    match: /(total|sum).*(wrong|off|doesn'?t (add|match)|incorrect)|doesn'?t add up/i,
    before: [],
    steps: [
      "Select the numbers and look at the status bar: Count vs Sum. If Count is higher than the numbers summed, some are text.",
      "Look for green triangles or left-aligned numbers: select them > the warning icon > Convert to Number.",
      "Check for hidden or filtered rows: SUM counts them, SUBTOTAL(109, range) doesn't.",
      "Click the total and check its range (the colored box) covers every row, including newly added ones. Formatting the data as a table (Ctrl+T) makes totals grow with new rows.",
      "Formulas > Show Formulas to spot cells typed over with a fixed number.",
    ],
    gotchas: [],
  },
  {
    id: "xl-highlight", app: "Excel", title: "Highlight duplicates or values over a limit",
    match: /highlight|conditional format|duplicates?|over budget/i,
    before: [],
    steps: [
      "Select the range.",
      "Home > Conditional Formatting > Highlight Cells Rules.",
      "Choose Duplicate Values, or Greater Than and type the limit (or click a cell holding it).",
      "Pick a format > OK. Manage Rules changes or removes it later.",
    ],
    gotchas: [],
  },
];

export function findGuide(text) {
  const t = String(text || "");
  if (!/\b(how|steps?|walk me|show me|help me|guide|set up|setup|build|create|make|fix|why)\b/i.test(t)) return null;
  return GUIDES.find((g) => g.match.test(t)) || null;
}

export function guideMarkdown(g) {
  return [
    `:::understood\nYou want the steps to ${g.title.charAt(0).toLowerCase() + g.title.slice(1)} in ${g.app}. Here's the checklist, from my built-in guides (0 tokens).\n:::`,
    `### ${g.title}`,
    g.before.length ? "**Before you start**\n" + g.before.map((b) => `- [ ] ${b}`).join("\n") : "",
    "**Steps**\n" + g.steps.map((s) => `- [ ] ${s}`).join("\n"),
    g.example ? `**Example:** \`${g.example}\`` : "",
    g.gotchas.length ? "**Watch out**\n" + g.gotchas.map((x) => `- ${x}`).join("\n") : "",
    `:::better\nYou can make this experience better if you tap the eye button and ask “Hey Otter, where's the next step?” while you're on that screen. I'll circle it on a snapshot. That sends one picture of your screen to Claude, so only do it when nothing sensitive is showing.\n:::`,
  ].filter(Boolean).join("\n\n");
}
