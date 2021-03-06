/*
Run Rollup in watch mode for development.

To specific the package to watch, simply pass its name and the desired build
formats to watch (defaults to "global"):

```
# name supports fuzzy match. will watch all packages with name containing "dom"
yarn dev dom

# specify the format to output
yarn dev core --formats cjs

# Can also drop all __DEV__ blocks with:
__DEV__=false yarn dev
```
*/

/*
eslint-disable
global-require,
import/order,
import/no-dynamic-require,
no-use-before-define,
no-await-in-loop,
operator-linebreak,
consistent-return,
*/

const execa = require('execa');
const args = require('minimist')(process.argv.slice(2));
const { fuzzyMatchTarget } = require('./utils');

const target = args._.length ? fuzzyMatchTarget(args._)[0] : 'meetnow';
const formats = args.formats || args.f;
const commit = execa.sync('git', ['rev-parse', 'HEAD']).stdout.slice(0, 7);

execa(
  'rollup',
  [
    '-wc',
    '--environment',
    [
      `COMMIT:${ commit }`,
      `TARGET:${ target }`,
      `FORMATS:${ formats || 'global' }`,
    ].join(','),
  ],
  {
    stdio : 'inherit',
  },
);
