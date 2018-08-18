const rString = require("randomstring");
const sCharset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@-&<>';

console.log(rString.generate({length: 100, charset: sCharset }));