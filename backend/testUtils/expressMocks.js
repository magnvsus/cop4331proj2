// Minimal Express req/res doubles shared by the controller/middleware tests --
// avoids pulling in supertest or a real HTTP server for pure unit tests.

function mockRequest({ body = {}, params = {}, headers = {}, user } = {}) {
  return {
    body,
    params,
    user,
    header: (name) => headers[name],
  };
}

function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.type = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

module.exports = { mockRequest, mockResponse };
