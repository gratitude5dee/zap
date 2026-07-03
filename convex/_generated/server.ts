type FunctionDefinition = {
  args?: unknown;
  handler: (ctx: any, args: any) => unknown;
  returns?: unknown;
};

export function query<T extends FunctionDefinition>(definition: T): T {
  return definition;
}

export function mutation<T extends FunctionDefinition>(definition: T): T {
  return definition;
}

export function action<T extends FunctionDefinition>(definition: T): T {
  return definition;
}

export function internalQuery<T extends FunctionDefinition>(definition: T): T {
  return definition;
}

export function internalMutation<T extends FunctionDefinition>(definition: T): T {
  return definition;
}

export function internalAction<T extends FunctionDefinition>(definition: T): T {
  return definition;
}

export function httpAction<T extends (ctx: any, request: Request) => unknown>(handler: T): T {
  return handler;
}
