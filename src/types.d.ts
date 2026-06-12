// crxjs `?script` imports resolve to the built asset path at runtime
declare module '*?script' {
  const path: string
  export default path
}
