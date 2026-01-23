export const getDashboardMaxReadingBooksCount = (isMobile: boolean): number => {
  return isMobile ? 2 : 3;
};
export const getDashboardMaxReadNextBooksCount = (
  isMobile: boolean,
): number => {
  return isMobile ? 3 : 8;
};
export const getDashboardRecentlyReadBooksCount = (
  isMobile: boolean,
): number => {
  return isMobile ? 1 : 3;
};
