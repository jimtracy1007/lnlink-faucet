function combineQueryString(method, params = {}, nodeType) {
  const obj = {
    method,
    params,
  };
  if (nodeType) {
    obj.node_type = nodeType;
  }
  return JSON.stringify(obj);
}
module.exports = {
    combineQueryString
}