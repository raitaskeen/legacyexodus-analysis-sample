function evaluateShortCircuit(flag: boolean) {
  // Contains logical short-circuiting: analyzer marks scope as UNSUPPORTED
  flag && console.log("conditional side effect");
  return flag;
}
