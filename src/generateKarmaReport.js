const sumReducer = (a, b) => a + b;

function generateKarmaReport(reviewerKarmaScoreMap) {
  const reviewersCount = Object.keys(reviewerKarmaScoreMap).length;
  const karmaReportArrays = [];
  let sumOfAllScores = Object.values(reviewerKarmaScoreMap).reduce(sumReducer, 0);
  const averageScore = Math.trunc(sumOfAllScores / reviewersCount);
  for (const reviewer in reviewerKarmaScoreMap) {
    const karmaScore = reviewerKarmaScoreMap[reviewer];
    const percentOfAverage = Math.trunc(100 * karmaScore / averageScore);
    karmaReportArrays.push([reviewer, karmaScore, percentOfAverage]);
  }
  karmaReportArrays.sort((a, b) => b[1] - a[1]);
  return karmaReportArrays;
}

module.exports = generateKarmaReport;
