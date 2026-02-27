type ClassValue = string | false | null | undefined
type ClassValueWithState<TState> =
  | ClassValue
  | ((state: TState) => string | false | null | undefined)

export function cn(...classes: ClassValue[]): string
export function cn<TState>(
  ...classes: ClassValueWithState<TState>[]
): string | ((state: TState) => string)
export function cn(
  ...classes: Array<
    | string
    | false
    | null
    | undefined
    | ((state: unknown) => string | false | null | undefined)
  >
): string | ((state: unknown) => string) {
  if (classes.some((className) => typeof className === "function")) {
    return ((state: unknown) =>
      classes
        .map((className) =>
          typeof className === "function" ? className(state) : className
        )
        .filter(Boolean)
        .join(" ")) as (state: unknown) => string
  }

  return classes.filter(Boolean).join(" ")
}
