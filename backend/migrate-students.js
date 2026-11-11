const mongoose = require('mongoose');
const Student = require('./models/Student');
const { validateKonguEmail } = require('./utils/emailValidator');
require('dotenv').config();

async function checkStudentEmails() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const students = await Student.find({});
    console.log(`\nAuditing ${students.length} existing student records...`);

    let validCount = 0;
    let missingCount = 0;
    let nonKonguCount = 0;

    for (const s of students) {
      const name = `${s.firstName} ${s.lastName || ''}`.trim();
      if (!s.email || !s.email.trim()) {
        console.log(`[ACTION NEEDED] Student ${s.studentId} (${name}): Missing email address.`);
        missingCount++;
      } else {
        const val = validateKonguEmail(s.email);
        if (val.isValid) {
          console.log(`[VALID KONGU EMAIL] Student ${s.studentId} (${name}): ${s.email}`);
          validCount++;
        } else {
          console.log(`[NON-KONGU EMAIL] Student ${s.studentId} (${name}): ${s.email} - Admin update available in UI.`);
          nonKonguCount++;
        }
      }
    }

    console.log('\n======================================================');
    console.log('STUDENT EMAIL AUDIT REPORT:');
    console.log(`- Total Students: ${students.length}`);
    console.log(`- Valid Kongu Institutional Emails: ${validCount}`);
    console.log(`- Non-Kongu Email Addresses: ${nonKonguCount} (Editable by Admin)`);
    console.log(`- Missing Email Addresses: ${missingCount} (Editable by Admin)`);
    console.log('Safe migration complete: No records deleted, no fabricated emails inserted.');
    console.log('======================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

checkStudentEmails();

