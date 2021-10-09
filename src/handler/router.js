const routes = require('./routes');

module.exports = app => {
  app.use('/aiFace/dev2service/api', routes);
}