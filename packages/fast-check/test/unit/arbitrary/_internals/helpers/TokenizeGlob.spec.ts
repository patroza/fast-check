import * as fc from 'fast-check';
import { GlobToken, GlobTokenKind, tokenizeGlob } from '../../../../../src/arbitrary/_internals/helpers/TokenizeGlob';

describe('tokenizeGlob', () => {
  it.each`
    pattern                                   | expectedTokens
    ${'a'}                                    | ${[exact('a')]}
    ${'abc'}                                  | ${[exact('abc')]}
    ${']'}                                    | ${[exact(']')]}
    ${'!'}                                    | ${[exact('!')]}
    ${'?'}                                    | ${[any()]}
    ${'*'}                                    | ${[all()]}
    ${'[a-z]'}                                | ${[range('a', 'z')]}
    ${'[!a-z]'}                               | ${[negRange('a', 'z')]}
    ${'[abc]'}                                | ${[set(['a', 'b', 'c'])]}
    ${'[!abc]'}                               | ${[negSet(['a', 'b', 'c'])]}
    ${'[[]'}                                  | ${[set(['['])]}
    ${'[]]'}                                  | ${[set([']'])]}
    ${'[?]'}                                  | ${[set(['?'])]}
    ${'[*]'}                                  | ${[set(['*'])]}
    ${'[]a]'}                                 | ${[set([']', 'a'])]}
    ${'[![]'}                                 | ${[negSet(['['])]}
    ${'[!]]'}                                 | ${[negSet([']'])]}
    ${'[!?]'}                                 | ${[negSet(['?'])]}
    ${'[!*]'}                                 | ${[negSet(['*'])]}
    ${'[!!]'}                                 | ${[negSet(['!'])]}
    ${'[!-]'}                                 | ${[negSet(['-'])]}
    ${'[!]a]'}                                | ${[negSet([']', 'a'])]}
    ${'[\u{1f431}-\u{1f434}]'}                | ${[range('\u{1f431}', '\u{1f434}')]}
    ${'Hello [A-Z]*! Choose between ? and ?'} | ${[exact('Hello '), range('A', 'Z'), all(), exact('! Choose between '), any(), exact(' and '), any()]}
    ${'[a]]'}                                 | ${[set(['a']), exact(']')]}
    ${'a]]a'}                                 | ${[exact('a]]a')]}
    ${'[a-]]'}                                | ${[set(['a', '-']), exact(']')]}
    ${'[!-a]'}                                | ${[negSet(['-', 'a'])]}
    ${'[!!-a]'}                               | ${[negRange('!', 'a')]}
    ${'[---]'}                                | ${[range('-', '-')]}
  `('should properly tokenize "$pattern"', ({ pattern, expectedTokens }) => {
    expect(tokenizeGlob(pattern)).toEqual(expectedTokens);
  });

  it.each`
    pattern
    ${'['}
    ${'[a'}
    ${'[]'}
  `('should throw errors for ill-formed pattern "$pattern"', ({ pattern }) => {
    expect(() => tokenizeGlob(pattern)).toThrow();
  });

  it('should be able to find back the source tokens by parsing globs', () => {
    fc.assert(
      fc.property(globArb(), ({ tokens, pattern }) => {
        expect(tokenizeGlob(pattern)).toEqual(tokens);
      })
    );
  });
});

// Helpers

function globArb(): fc.Arbitrary<{ tokens: GlobToken[]; pattern: string }> {
  const tokens: fc.Arbitrary<GlobToken[]> = fc.array(
    fc.oneof(
      fc.record<GlobToken>({
        kind: fc.constant(GlobTokenKind.All as const),
      }),
      fc.record<GlobToken>({
        kind: fc.constant(GlobTokenKind.Any as const),
      }),
      fc.record<GlobToken>({
        kind: fc.constant(GlobTokenKind.Disjonction as const),
        type: fc.constant('range' as const),
        negate: fc.boolean(),
        from: fc.char().filter((c) => c !== '!'), // supported for negate:true, but limitation for negate:false
        to: fc.char().filter((c) => c !== ']'),
      }),
      fc.record<GlobToken>({
        kind: fc.constant(GlobTokenKind.Disjonction as const),
        type: fc.constant('set' as const),
        negate: fc.boolean(),
        value: fc
          .uniqueArray(fc.char(), { minLength: 1 })
          .filter((values) => values.length !== 1 || values[0] !== '!') // no support for sets containing only !
          .map((unordered) => {
            const hasClosingBracket = unordered.includes(']'); // must be first
            const hasExclamationMark = unordered.includes('!'); // must not be first
            const hasDash = unordered.includes('-'); // must not be second
            const unorderedWithoutSpecials = unordered.filter((c) => c !== ']' && c !== '!' && c !== '-');
            if (hasClosingBracket) {
              return [...`]${unorderedWithoutSpecials}${hasExclamationMark ? '!' : ''}${hasDash ? '-' : ''}`];
            }
            return [...`${hasDash ? '-' : ''}${unorderedWithoutSpecials}${hasExclamationMark ? '!' : ''}`];
          }),
      }),
      fc.record<GlobToken>({
        kind: fc.constant(GlobTokenKind.Exact),
        value: fc.stringOf(
          fc.char().filter((c) => c !== '?' && c !== '*' && c !== '['),
          { minLength: 1 }
        ),
      })
    )
  );
  const mergedExactTokens: fc.Arbitrary<GlobToken[]> = tokens.map((t) => {
    const nt: typeof t = [];
    for (const token of t) {
      const previousToken = nt[nt.length - 1];
      if (token.kind !== GlobTokenKind.Exact) {
        nt.push(token);
      } else if (previousToken === undefined || previousToken.kind !== GlobTokenKind.Exact) {
        nt.push(token);
      } else {
        nt[nt.length - 1] = { ...previousToken, value: previousToken.value + token.value };
      }
    }
    return nt;
  });
  return mergedExactTokens.map((t) => {
    return {
      tokens: t,
      pattern: t
        .map((token): string => {
          switch (token.kind) {
            case GlobTokenKind.All:
              return '*';
            case GlobTokenKind.Any:
              return '?';
            case GlobTokenKind.Disjonction:
              if (token.type === 'range') {
                return `[${token.negate ? '!' : ''}${token.from}-${token.to}]`;
              }
              return `[${token.negate ? '!' : ''}${token.value.join('')}]`;
            case GlobTokenKind.Exact:
              return token.value; // no ?, * or [ in our generated value
          }
        })
        .join(''),
    };
  });
}

function any() {
  return { kind: GlobTokenKind.Any };
}

function all() {
  return { kind: GlobTokenKind.All };
}

function exact(value: string) {
  return { kind: GlobTokenKind.Exact, value };
}

function range(from: string, to: string) {
  return { kind: GlobTokenKind.Disjonction, negate: false, type: 'range', from, to };
}

function negRange(from: string, to: string) {
  return { kind: GlobTokenKind.Disjonction, negate: true, type: 'range', from, to };
}

function set(values: string[]) {
  return { kind: GlobTokenKind.Disjonction, negate: false, type: 'set', value: values };
}

function negSet(values: string[]) {
  return { kind: GlobTokenKind.Disjonction, negate: true, type: 'set', value: values };
}
