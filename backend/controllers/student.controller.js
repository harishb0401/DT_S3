const Student = require('../models/Student');
const Bus = require('../models/Bus');
const faceAI = require('../services/faceAI.service');
const { validateKonguEmail } = require('../utils/emailValidator');

// Helper to auto-enroll face embeddings if a photoUrl is present
const autoEnrollFace = async (student) => {
  if (!student.photoUrl || !student.photoUrl.startsWith('data:image')) return;
  try {
    const result = await faceAI.registerFace(String(student._id), [student.photoUrl]);
    if (result?.embedding?.length) {
      student.faceData = {
        embeddings: result.embedding,
        templates: Array.isArray(result.templates) && result.templates.length ? result.templates : [result.embedding],
        referenceImageUrl: result.reference_image_url || student.photoUrl,
        registeredAt: new Date(),
        lastUpdatedAt: new Date(),
        modelVersion: result.model || 'SFace',
      };
      student.faceRegistrationStatus = 'registered';
      await student.save();
    }
  } catch (faceErr) {
    console.warn(`Auto face registration for student ${student.studentId} skipped: ${faceErr.message}`);
  }
};

// Get all students
exports.getAllStudents = async (req, res) => {
  try {
    const students = await Student.find().populate('busId', 'busNumber');
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get student by ID
exports.getStudentById = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate('busId');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create student
exports.createStudent = async (req, res) => {
  try {
    // 1. Mandatory Kongu Institutional Email validation
    const emailValidation = validateKonguEmail(req.body.email);
    if (!emailValidation.isValid) {
      return res.status(400).json({ message: emailValidation.error });
    }
    const normalizedEmail = emailValidation.normalizedEmail;

    // 2. Prevent duplicate email IDs
    const duplicateEmail = await Student.findOne({ email: normalizedEmail });
    if (duplicateEmail) {
      return res.status(400).json({ message: 'A student with this Kongu institutional email ID is already registered.' });
    }

    // 3. Prevent duplicate student IDs
    if (req.body.studentId) {
      const duplicateId = await Student.findOne({ studentId: req.body.studentId.trim() });
      if (duplicateId) {
        return res.status(400).json({ message: 'A student with this Student ID is already registered.' });
      }
    }

    const studentData = {
      ...req.body,
      email: normalizedEmail,
    };

    const student = new Student(studentData);
    await student.save();

    // Add student to bus assignedStudents
    if (student.busId) {
      await Bus.findByIdAndUpdate(student.busId, { $addToSet: { assignedStudents: student._id } });
    }
    // Auto-enroll face embeddings if photo was provided
    await autoEnrollFace(student);
    res.status(201).json(student);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update student
exports.updateStudent = async (req, res) => {
  try {
    const existingStudent = await Student.findById(req.params.id);
    if (!existingStudent) return res.status(404).json({ message: 'Student not found' });

    const updateData = { ...req.body };

    // If email is provided/modified, validate and check uniqueness
    if (req.body.email) {
      const emailValidation = validateKonguEmail(req.body.email);
      if (!emailValidation.isValid) {
        return res.status(400).json({ message: emailValidation.error });
      }
      const normalizedEmail = emailValidation.normalizedEmail;
      const duplicateEmail = await Student.findOne({
        email: normalizedEmail,
        _id: { $ne: req.params.id },
      });
      if (duplicateEmail) {
        return res.status(400).json({ message: 'A student with this Kongu institutional email ID is already registered.' });
      }
      updateData.email = normalizedEmail;
    }

    // If busId changed, update old and new bus assignedStudents
    if (req.body.busId && String(existingStudent.busId) !== String(req.body.busId)) {
      if (existingStudent.busId) {
        await Bus.findByIdAndUpdate(existingStudent.busId, { $pull: { assignedStudents: existingStudent._id } });
      }
      await Bus.findByIdAndUpdate(req.body.busId, { $addToSet: { assignedStudents: existingStudent._id } });
    }

    const student = await Student.findByIdAndUpdate(req.params.id, updateData, { new: true });
    // If photo was changed/provided, re-enroll face embeddings
    if (req.body.photoUrl && req.body.photoUrl !== existingStudent.photoUrl) {
      await autoEnrollFace(student);
    }
    res.json(student);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete student
exports.deleteStudent = async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    if (student.busId) {
      await Bus.findByIdAndUpdate(student.busId, { $pull: { assignedStudents: student._id } });
    }
    res.json({ message: 'Student deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Register face
exports.registerFace = async (req, res) => {
  try {
    const { embeddings, referenceImageUrl, modelVersion } = req.body;
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    student.faceData = {
      embeddings,
      referenceImageUrl,
      registeredAt: new Date(),
      lastUpdatedAt: new Date(),
      modelVersion: modelVersion || 'v1',
    };
    student.faceRegistrationStatus = 'registered';
    await student.save();
    res.json({ message: 'Face registered successfully', student });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};