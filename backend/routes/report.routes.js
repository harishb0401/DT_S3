const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getDailyReport,
  getWeeklyReport,
  getMonthlyReport,
  getFeeReportSummary,
  downloadFeeReport,
} = require('../controllers/report.controller');

const router = express.Router();
router.use(authenticate);
router.get('/daily', getDailyReport);
router.get('/weekly', getWeeklyReport);
router.get('/monthly', getMonthlyReport);
router.get('/fee-report/summary', getFeeReportSummary);
router.get('/fee-report/download', downloadFeeReport);
module.exports = router;