export let compareVersions = (a: string = "0.0.0", b: string = "0.0.0") => {
  let ap = a.split(".").map((x: string) => parseInt(x)) as [
    number,
    number,
    number,
  ];
  let bp = b.split(".").map((x: string) => parseInt(x)) as [
    number,
    number,
    number,
  ];
  if (ap[0] - bp[0]) {
    return Math.sign(ap[0] - bp[0]);
  }
  if (ap[0] === bp[0] && ap[1] - bp[1]) {
    return Math.sign(ap[1] - bp[1]);
  }
  if (ap[0] === bp[0] && ap[1] === bp[1] && ap[2] - bp[2]) {
    return Math.sign(ap[2] - bp[2]);
  }
  return 0;
};
