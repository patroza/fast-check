import { Arbitrary } from '../check/arbitrary/definition/Arbitrary';
import fc from '../fast-check';
import { GlobTokenKind, tokenizeGlob } from './_internals/helpers/TokenizeGlob';
import { constantFrom } from './constantFrom';
import { integer } from './integer';
import { mapToConstant } from './mapToConstant';

type MatchingGlobConstraints = {
  charArb?: Arbitrary<string>;
};

/**
 * More details on glob at https://en.wikipedia.org/wiki/Glob_(programming) and https://stackoverflow.com/questions/2595119/glob-and-bracket-characters
 * @remarks Since 3.10.0
 * @public
 */
export function matchingGlob(globPattern: string, constraints?: MatchingGlobConstraints): Arbitrary<string> {
  const { charArb = fc.char() } = constraints || {};
  const tokens = tokenizeGlob(globPattern);
  const stringArbs = tokens.map((token): Arbitrary<string> => {
    switch (token.kind) {
      case GlobTokenKind.Any:
        return charArb;
      case GlobTokenKind.All:
        return fc.stringOf(charArb);
      case GlobTokenKind.Disjonction:
        if (token.type === 'range') {
          const rangeRequestedMin = token.from.codePointAt(0) || -1;
          const rangeRequestedMax = token.to.codePointAt(0) || -1;
          if (token.negate) {
            return mapToConstant(
              { num: rangeRequestedMin - 0x20, build: (n) => String.fromCodePoint(n + 0x20) },
              { num: 0x7e - rangeRequestedMax, build: (n) => String.fromCodePoint(n + rangeRequestedMax + 1) }
            );
          }
          return integer({ min: rangeRequestedMin, max: rangeRequestedMax }).map(
            (n) => String.fromCodePoint(n),
            (v) => {
              if (typeof v !== 'string') throw new Error('Invalid type');
              if (v.length === 0) throw new Error('Empty string');
              if (v.codePointAt(1) !== undefined) throw new Error('Multiple code points');
              return v.codePointAt(0) || -1;
            }
          );
        } else {
          if (token.negate) {
            const contentCharsSet = new Set(token.value);
            return charArb.filter((c) => !contentCharsSet.has(c));
          }
          return constantFrom(...token.value);
        }
      case GlobTokenKind.Exact:
        return fc.constant(token.value);
    }
  });
  return fc.tuple(...stringArbs).map((strings) => strings.join(''));
}
