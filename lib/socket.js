let io = null;
module.exports = {
  set: (serverIo) => { io = serverIo; },
  get: () => io,
  emit: (event, payload) => { if (io) io.emit(event, payload); }
};
