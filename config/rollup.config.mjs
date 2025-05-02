// See: https://rollupjs.org/introduction/

import commonjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

// Use tsc's config parsing since it fully resolves extends
import ts from 'typescript'
const tsconfigFileName = ts.findConfigFile('./', ts.sys.fileExists)
const tsconfigDiagnosticReporter = ts.createDiagnosticReporter(ts.sys)
const tsconfig = ts.getParsedCommandLineOfConfigFile(
  tsconfigFileName,
  undefined,
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: tsconfigDiagnosticReporter
  }
)

const config = {
  input: 'src/index.ts',
  output: {
    esModule: true,
    file: 'dist/index.js',
    format: 'es',
    sourcemap: true
  },
  plugins: [
    typescript({
      compilerOptions: tsconfig.options
    }),
    nodeResolve({ preferBuiltins: true }),
    commonjs()
  ]
}

export default config
