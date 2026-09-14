function decide(flag: boolean) {
  let status = "pending";
  if (flag) {
    status = "approved";
  } else {
    status = "rejected";
  }
  return status;
}
