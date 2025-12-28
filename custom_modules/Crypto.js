function generateMCDCode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const pattern = 'NNXXNXXXNXXX';
  
  let result = '';
  
  for (const char of pattern) {
    if (char === 'N') {
      result += numbers[Math.floor(Math.random() * numbers.length)];
    } else if (char === 'X') {
      result += letters[Math.floor(Math.random() * letters.length)];
    } else {
      result += char; // in case you ever add symbols or separators
    }
  }


  
  return result;
}

module.exports = generateMCDCode;
