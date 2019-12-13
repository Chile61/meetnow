module.exports = {
  root : true,

  extends : [
    '@meetnow',
  ],

  rules : {
    'no-console'  : process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger' : process.env.NODE_ENV === 'production' ? 'error' : 'off',
  },
};
