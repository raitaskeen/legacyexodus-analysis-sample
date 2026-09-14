function classifyScore(score: number) {
  if (score >= 70) {
    return "pass";
  }

  return "review";
}

classifyScore(82);