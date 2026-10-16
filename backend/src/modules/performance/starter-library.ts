/**
 * A starter KRA and KPI library a workspace can load in one step, then edit
 * like anything it made itself. Department KRAs are scoped to the
 * workspace's departments found by name; company-wide KRAs are for everyone.
 * Suggested weights are 65% across a department's KRAs and 35% across the
 * company-wide ones, so a template using both starts at 100%.
 */

type Measurement = 'PERCENTAGE' | 'CURRENCY' | 'COUNT' | 'DURATION' | 'QUALITY_SCORE' | 'RATING';
type Direction = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'NOT_APPLICABLE';
type Evidence = 'NONE' | 'OPTIONAL' | 'REQUIRED';

export interface StarterKpi {
  code: string;
  name: string;
  description: string;
  type: Measurement;
  unit: string | null;
  direction: Direction;
  /** Threshold, target and stretch; null when each employee gets their own target. */
  targets: [string, string, string] | null;
  evidence: Evidence;
}

export interface StarterKra {
  code: string;
  name: string;
  description: string;
  weight: string;
  /** Which departments it is for, by name; null for everyone. */
  department: { label: string; match: RegExp } | null;
  /** Rated on the starter rating scale. */
  rated: boolean;
  kpis: [code: string, weight: string][];
}

export const STARTER_SCALE = {
  code: 'FIVE_POINT',
  name: 'Five-point rating',
  levels: ['Needs improvement', 'Below expectations', 'Meets expectations', 'Exceeds expectations', 'Outstanding'],
};

const pct = (code: string, name: string, description: string, direction: Direction, targets: [string, string, string], evidence: Evidence = 'OPTIONAL'): StarterKpi =>
  ({ code, name, description, type: 'PERCENTAGE', unit: '%', direction, targets, evidence });
const count = (code: string, name: string, description: string, unit: string, direction: Direction, targets: [string, string, string] | null, evidence: Evidence = 'OPTIONAL'): StarterKpi =>
  ({ code, name, description, type: 'COUNT', unit, direction, targets, evidence });
const time = (code: string, name: string, description: string, unit: string, direction: Direction, targets: [string, string, string], evidence: Evidence = 'OPTIONAL'): StarterKpi =>
  ({ code, name, description, type: 'DURATION', unit, direction, targets, evidence });
const money = (code: string, name: string, description: string, direction: Direction, evidence: Evidence = 'REQUIRED'): StarterKpi =>
  ({ code, name, description, type: 'CURRENCY', unit: null, direction, targets: null, evidence });
const rated = (code: string, name: string, description: string): StarterKpi =>
  ({ code, name, description, type: 'RATING', unit: null, direction: 'NOT_APPLICABLE', targets: null, evidence: 'NONE' });

const HIGHER = 'HIGHER_IS_BETTER';
const LOWER = 'LOWER_IS_BETTER';

export const STARTER_KPIS: StarterKpi[] = [
  // Engineering
  pct('ENG_ON_TIME_DELIVERY', 'Tasks delivered on time', 'Share of committed sprint tasks delivered by their due date.', HIGHER, ['75', '90', '98']),
  count('ENG_PROD_DEFECTS', 'Production defects', 'Defects found in production that trace back to the employee’s work.', 'defects', LOWER, ['5', '2', '0']),
  pct('ENG_TEST_COVERAGE', 'Unit test coverage', 'Share of code covered by automated unit tests in owned modules.', HIGHER, ['60', '80', '90']),
  time('ENG_REVIEW_TURNAROUND', 'Code review turnaround', 'Average time to complete a requested code review.', 'hours', LOWER, ['48', '24', '8']),
  time('ENG_INCIDENT_RESOLUTION', 'Incident resolution time', 'Average time to resolve critical production incidents assigned.', 'hours', LOWER, ['24', '8', '4']),
  // Quality assurance
  pct('QA_TEST_EXECUTION', 'Planned tests executed', 'Share of planned test cases executed before each release.', HIGHER, ['85', '95', '100']),
  pct('QA_AUTOMATION_COVERAGE', 'Regression tests automated', 'Share of the regression suite that runs automatically.', HIGHER, ['40', '60', '80']),
  pct('QA_DEFECT_LEAKAGE', 'Defect leakage', 'Share of defects found after release rather than in testing.', LOWER, ['10', '5', '2']),
  pct('QA_INVALID_BUGS', 'Bugs rejected as invalid', 'Share of reported bugs closed as invalid or not reproducible.', LOWER, ['20', '10', '5']),
  // Sales & marketing
  money('SALES_REVENUE', 'Revenue closed', 'Value of deals won in the period. Targets are set for each person.', HIGHER),
  count('SALES_NEW_CLIENTS', 'New clients won', 'Number of new clients signed in the period. Targets are set for each person.', 'clients', HIGHER, null),
  pct('SALES_CONVERSION', 'Lead-to-deal conversion', 'Share of qualified leads converted to won deals.', HIGHER, ['10', '20', '30']),
  pct('SALES_FOLLOWUP_ON_TIME', 'Follow-ups on time', 'Share of scheduled follow-ups completed by their due date.', HIGHER, ['85', '95', '100']),
  count('MKT_QUALIFIED_LEADS', 'Marketing-qualified leads', 'Number of leads generated that meet the qualification criteria. Targets are set for each person.', 'leads', HIGHER, null),
  money('MKT_COST_PER_LEAD', 'Cost per qualified lead', 'Marketing spend divided by qualified leads generated.', LOWER, 'OPTIONAL'),
  // Product & design
  pct('PD_ROADMAP_DELIVERY', 'Roadmap items shipped as planned', 'Share of committed roadmap items shipped in the planned release.', HIGHER, ['70', '85', '95']),
  pct('PD_HANDOFF_ON_TIME', 'Design handoffs on time', 'Share of design handoffs delivered to engineering by the agreed date.', HIGHER, ['75', '90', '100']),
  count('PD_REWORK_REQUESTS', 'Rework after handoff', 'Design changes requested after handoff because of gaps in the design.', 'requests', LOWER, ['6', '3', '1']),
  { code: 'PD_FEATURE_CSAT', name: 'Feature satisfaction (CSAT)', description: 'Average customer satisfaction score for features released, out of 5.', type: 'QUALITY_SCORE', unit: '/ 5', direction: HIGHER, targets: ['3.5', '4', '4.5'], evidence: 'OPTIONAL' },
  // Operations
  pct('OPS_SLA_ADHERENCE', 'Requests within SLA', 'Share of service requests closed within the agreed service level.', HIGHER, ['85', '95', '99']),
  time('OPS_REQUEST_TURNAROUND', 'Request turnaround time', 'Average time to complete an operations request.', 'hours', LOWER, ['48', '24', '8']),
  money('OPS_COST_SAVINGS', 'Cost savings achieved', 'Verified savings from process, vendor or resource improvements. Targets are set for each person.', HIGHER),
  count('OPS_AUDIT_FINDINGS', 'Audit findings', 'Internal or external audit and compliance findings in the area owned.', 'findings', LOWER, ['3', '1', '0']),
  // Accounts & finance
  time('FIN_BOOKS_CLOSE', 'Days to close the books', 'Working days after month end to close the monthly accounts.', 'days', LOWER, ['8', '5', '3']),
  pct('FIN_PAYROLL_ACCURACY', 'Payroll without corrections', 'Share of payslips processed without a later correction.', HIGHER, ['97', '99', '100']),
  time('FIN_DSO', 'Days sales outstanding', 'Average days to collect receivables.', 'days', LOWER, ['60', '45', '30']),
  pct('FIN_FILINGS_ON_TIME', 'Statutory filings on time', 'Share of GST, TDS, PF and other statutory filings made by their due date.', HIGHER, ['95', '100', '100']),
  // Human resources
  time('HR_TIME_TO_HIRE', 'Time to hire', 'Average days from opening a position to the offer being accepted.', 'days', LOWER, ['45', '30', '21']),
  pct('HR_OFFER_ACCEPTANCE', 'Offer acceptance rate', 'Share of offers made that candidates accepted.', HIGHER, ['65', '80', '90']),
  pct('HR_ONBOARDING_ON_TIME', 'Joiners onboarded on time', 'Share of new joiners with documents, accounts and induction complete in their first week.', HIGHER, ['85', '95', '100']),
  pct('HR_ATTRITION', 'Voluntary attrition', 'Annualised share of employees who resigned.', LOWER, ['18', '12', '8']),
  time('HR_TRAINING_HOURS', 'Training hours per employee', 'Average training hours delivered per employee in the period.', 'hours', HIGHER, ['8', '16', '24']),
  // Everyone
  pct('CORE_ATTENDANCE', 'Attendance', 'Share of working days present, excluding approved leave.', HIGHER, ['90', '95', '98']),
  count('CORE_LATE_ARRIVALS', 'Late arrivals', 'Days arrived after the shift’s grace period.', 'days', LOWER, ['5', '2', '0'], 'NONE'),
  rated('CORE_TEAMWORK', 'Teamwork and collaboration', 'Works well with others, shares knowledge and helps the team succeed.'),
  rated('CORE_COMMUNICATION', 'Communication', 'Communicates clearly, on time and with the right people.'),
  rated('CORE_OWNERSHIP', 'Ownership and initiative', 'Takes responsibility for outcomes and acts without being asked.'),
  time('CORE_LEARNING_HOURS', 'Learning hours completed', 'Hours of courses, certifications or structured learning completed.', 'hours', HIGHER, ['6', '12', '24']),
];

const dept = (label: string, match: RegExp) => ({ label, match });
const ENGINEERING = dept('Engineering', /engineer|\btech|develop|software/i);
const QA = dept('Quality Assurance', /quality|\bqa\b|testing/i);
const SALES = dept('Sales & Marketing', /sales|marketing|business dev/i);
const PRODUCT = dept('Product & Design', /product|design|\bux\b/i);
const OPERATIONS = dept('Operations', /operation|\bops\b/i);
const FINANCE = dept('Accounts & Finance', /account|financ/i);
const HR = dept('Human Resources', /human|\bhr\b|people|talent/i);

export const STARTER_KRAS: StarterKra[] = [
  { code: 'ENG_DELIVERY', name: 'Engineering delivery', description: 'Delivering committed work on time with few defects.', weight: '25', department: ENGINEERING, rated: false, kpis: [['ENG_ON_TIME_DELIVERY', '60'], ['ENG_PROD_DEFECTS', '40']] },
  { code: 'ENG_CODE_QUALITY', name: 'Code quality and reviews', description: 'Well-tested code and timely, useful reviews.', weight: '20', department: ENGINEERING, rated: false, kpis: [['ENG_TEST_COVERAGE', '50'], ['ENG_REVIEW_TURNAROUND', '50']] },
  { code: 'ENG_RELIABILITY', name: 'System reliability and support', description: 'Resolving production incidents quickly.', weight: '20', department: ENGINEERING, rated: false, kpis: [['ENG_INCIDENT_RESOLUTION', '100']] },
  { code: 'QA_TEST_COVERAGE', name: 'Test coverage', description: 'Executing the planned tests and growing automation.', weight: '30', department: QA, rated: false, kpis: [['QA_TEST_EXECUTION', '50'], ['QA_AUTOMATION_COVERAGE', '50']] },
  { code: 'QA_RELEASE_QUALITY', name: 'Release quality', description: 'Catching defects before release, with accurate bug reports.', weight: '35', department: QA, rated: false, kpis: [['QA_DEFECT_LEAKAGE', '60'], ['QA_INVALID_BUGS', '40']] },
  { code: 'SALES_REVENUE_GROWTH', name: 'Revenue growth', description: 'Closing revenue and winning new clients.', weight: '35', department: SALES, rated: false, kpis: [['SALES_REVENUE', '70'], ['SALES_NEW_CLIENTS', '30']] },
  { code: 'SALES_PIPELINE', name: 'Pipeline discipline', description: 'Converting leads and following up on time.', weight: '15', department: SALES, rated: false, kpis: [['SALES_CONVERSION', '60'], ['SALES_FOLLOWUP_ON_TIME', '40']] },
  { code: 'MKT_DEMAND_GENERATION', name: 'Demand generation', description: 'Generating qualified leads cost-effectively.', weight: '15', department: SALES, rated: false, kpis: [['MKT_QUALIFIED_LEADS', '60'], ['MKT_COST_PER_LEAD', '40']] },
  { code: 'PD_PRODUCT_DELIVERY', name: 'Product delivery', description: 'Shipping the roadmap as planned.', weight: '25', department: PRODUCT, rated: false, kpis: [['PD_ROADMAP_DELIVERY', '100']] },
  { code: 'PD_DESIGN_QUALITY', name: 'Design quality', description: 'Timely, complete designs that customers are satisfied with.', weight: '40', department: PRODUCT, rated: false, kpis: [['PD_HANDOFF_ON_TIME', '40'], ['PD_REWORK_REQUESTS', '30'], ['PD_FEATURE_CSAT', '30']] },
  { code: 'OPS_SERVICE_DELIVERY', name: 'Service delivery', description: 'Completing requests within their service levels.', weight: '40', department: OPERATIONS, rated: false, kpis: [['OPS_SLA_ADHERENCE', '60'], ['OPS_REQUEST_TURNAROUND', '40']] },
  { code: 'OPS_EFFICIENCY', name: 'Efficiency and compliance', description: 'Saving cost and keeping audits clean.', weight: '25', department: OPERATIONS, rated: false, kpis: [['OPS_COST_SAVINGS', '50'], ['OPS_AUDIT_FINDINGS', '50']] },
  { code: 'FIN_REPORTING', name: 'Accurate and timely accounts', description: 'Closing the books on time and paying people correctly.', weight: '35', department: FINANCE, rated: false, kpis: [['FIN_BOOKS_CLOSE', '50'], ['FIN_PAYROLL_ACCURACY', '50']] },
  { code: 'FIN_CASH_COMPLIANCE', name: 'Cash flow and compliance', description: 'Collecting receivables and filing statutory returns on time.', weight: '30', department: FINANCE, rated: false, kpis: [['FIN_DSO', '50'], ['FIN_FILINGS_ON_TIME', '50']] },
  { code: 'HR_TALENT_ACQUISITION', name: 'Talent acquisition', description: 'Hiring quickly, with offers accepted and joiners onboarded well.', weight: '30', department: HR, rated: false, kpis: [['HR_TIME_TO_HIRE', '40'], ['HR_OFFER_ACCEPTANCE', '30'], ['HR_ONBOARDING_ON_TIME', '30']] },
  { code: 'HR_RETENTION_GROWTH', name: 'Retention and development', description: 'Keeping attrition low and developing people.', weight: '35', department: HR, rated: false, kpis: [['HR_ATTRITION', '50'], ['HR_TRAINING_HOURS', '50']] },
  { code: 'CORE_DISCIPLINE', name: 'Attendance and discipline', description: 'Being present and on time.', weight: '10', department: null, rated: false, kpis: [['CORE_ATTENDANCE', '60'], ['CORE_LATE_ARRIVALS', '40']] },
  { code: 'CORE_BEHAVIOURS', name: 'Teamwork and communication', description: 'How the employee works with others, rated by reviewers.', weight: '15', department: null, rated: true, kpis: [['CORE_TEAMWORK', '40'], ['CORE_COMMUNICATION', '30'], ['CORE_OWNERSHIP', '30']] },
  { code: 'CORE_LEARNING', name: 'Learning and growth', description: 'Building skills through structured learning.', weight: '10', department: null, rated: false, kpis: [['CORE_LEARNING_HOURS', '100']] },
];
