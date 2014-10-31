exports.config = {
  app_name : ['coinapse'],
  license_key : process.env.NEW_RELIC_LICENSE_KEY,
  logging : {
    level : 'trace'
  },
  rules : {
    ignore : [
      '^/socket.io/*/xhr-polling'
    ]
  }
};
