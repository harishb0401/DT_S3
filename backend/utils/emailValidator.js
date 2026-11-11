// Utility for validating Kongu Institutional Email IDs
const getAllowedDomains = () => {
  const envVal = process.env.KONGU_EMAIL_DOMAINS || 'kongu.edu,kongu.ac.in';
  return envVal
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
};

const validateKonguEmail = (email) => {
  if (!email || typeof email !== 'string' || !email.trim()) {
    return {
      isValid: false,
      error: 'Kongu institutional email ID is required.',
    };
  }

  const normalized = email.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(normalized)) {
    return {
      isValid: false,
      error: 'Invalid email address format.',
    };
  }

  const allowedDomains = getAllowedDomains();
  const domainPart = normalized.split('@')[1];
  const isKonguDomain = allowedDomains.some(
    (allowed) => domainPart === allowed || domainPart.endsWith('.' + allowed)
  );

  if (!isKonguDomain) {
    return {
      isValid: false,
      error: `Email must belong to the Kongu institutional domain (@${allowedDomains.join(' or @')}).`,
    };
  }

  return {
    isValid: true,
    normalizedEmail: normalized,
  };
};

module.exports = {
  validateKonguEmail,
  getAllowedDomains,
};

