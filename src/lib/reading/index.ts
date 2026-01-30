export type { ChartDataPoint } from "./chart-utils";
export {
  aggregateByDay,
  calculateAveragePace,
  calculateTrendline,
  ensureZeroBaseline,
  estimateCompletion,
  formatEstimatedDate,
  formatFullTimestamp,
  formatRelativeDate,
} from "./chart-utils";
export {
  getDashboardMaxReadingBooksCount,
  getDashboardMaxReadNextBooksCount,
  getDashboardRecentlyReadBooksCount,
} from "./dashboard-utils";
export type { ValidateProgressParams } from "./progress-validation-utils";
export { validateProgress } from "./progress-validation-utils";
export type {
  BooksFinishedByYear,
  BuildGoalHistoryOptions,
  CheckGoalCelebrationParams,
  CheckGoalCelebrationResult,
  GoalHistoryEntry,
  ReadingGoalHistoryEntry,
  ReadingGoalStats,
} from "./reading-goal-utils";
export {
  buildGoalHistory,
  calculateReadingGoalStats,
  checkGoalCelebration,
} from "./reading-goal-utils";
export type {
  DailyStats,
  OverallStats,
  ReadingProgressWithBook,
  ReadingProgressWithProgressSinceLast,
  ReadingStats,
  StreakDetails,
  WeeklyStats,
  YearlyStats,
} from "./reading-stats-utils";
export {
  calculateDailyStats,
  calculateOverallStats,
  calculateReadingStats,
  calculateStreakDetails,
  calculateWeeklyStats,
  calculateYearlyStats,
  transformProgressHistory,
} from "./reading-stats-utils";
