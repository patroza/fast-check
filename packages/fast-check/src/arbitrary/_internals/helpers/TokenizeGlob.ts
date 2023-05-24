/**
 * All possible kinds of tokens definabled on our Globs
 * @internal
 */
export enum GlobTokenKind {
  Any,
  All,
  Exact,
  Disjonction,
}

/**
 * Definition of a token associated to our Glob format
 * @internal
 */
export type GlobToken =
  | { kind: GlobTokenKind.Any }
  | { kind: GlobTokenKind.All }
  | { kind: GlobTokenKind.Exact; value: string }
  | { kind: GlobTokenKind.Disjonction; negate: boolean; type: 'range'; from: string; to: string }
  | { kind: GlobTokenKind.Disjonction; negate: boolean; type: 'set'; value: string[] };

/**
 * Convert a glob pattern defined as a string into an array of tokens
 * @internal
 */
export function tokenizeGlob(globPattern: string): GlobToken[] {
  const tokens: GlobToken[] = [];
  let acc = '';
  let buildingDisjonctionSince = undefined;
  let isNegateDisjonction = false;
  for (let index = 0; index !== globPattern.length; ++index) {
    if (buildingDisjonctionSince === undefined) {
      switch (globPattern[index]) {
        case '?': {
          if (acc !== '') {
            tokens.push({ kind: GlobTokenKind.Exact, value: acc });
            acc = '';
          }
          tokens.push({ kind: GlobTokenKind.Any });
          break;
        }
        case '*': {
          if (acc !== '') {
            tokens.push({ kind: GlobTokenKind.Exact, value: acc });
            acc = '';
          }
          tokens.push({ kind: GlobTokenKind.All });
          break;
        }
        case '[': {
          if (acc !== '') {
            tokens.push({ kind: GlobTokenKind.Exact, value: acc });
            acc = '';
          }
          buildingDisjonctionSince = index;
          isNegateDisjonction = false;
          acc = '';
          break;
        }
        default: {
          acc += globPattern[index];
          break;
        }
      }
    } else {
      switch (globPattern[index]) {
        case '!': {
          if (index === buildingDisjonctionSince + 1) {
            isNegateDisjonction = true;
          } else {
            acc += globPattern[index];
          }
          break;
        }
        case ']': {
          if (
            index === buildingDisjonctionSince + 1 ||
            (isNegateDisjonction && index === buildingDisjonctionSince + 2)
          ) {
            acc += globPattern[index];
          } else {
            const accItems = [...acc];
            if (accItems.length === 3 && accItems[1] === '-') {
              tokens.push({
                kind: GlobTokenKind.Disjonction,
                negate: isNegateDisjonction,
                type: 'range',
                from: accItems[0],
                to: accItems[2],
              });
            } else {
              if (accItems.length === 0) {
                throw new Error(`Glob sets must specify at least one value, no [] or [!] expected`);
              }
              tokens.push({
                kind: GlobTokenKind.Disjonction,
                negate: isNegateDisjonction,
                type: 'set',
                value: accItems,
              });
            }
            buildingDisjonctionSince = undefined;
            isNegateDisjonction = false;
            acc = '';
          }
          break;
        }
        default: {
          acc += globPattern[index];
          break;
        }
      }
    }
  }
  if (buildingDisjonctionSince !== undefined) {
    throw new Error('Glob sets have to be closed via a ]');
  }
  if (acc !== '') {
    if (buildingDisjonctionSince === undefined) {
      tokens.push({ kind: GlobTokenKind.Exact, value: acc });
    }
  }
  return tokens;
}
