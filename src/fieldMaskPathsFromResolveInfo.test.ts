import {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  graphql,
  GraphQLUnionType,
  GraphQLInterfaceType,
  GraphQLObjectTypeConfig,
  extendSchema,
  parse,
} from "graphql";
import { fieldMaskPathsFromResolveInfo, GetFieldNameFunc } from "./fieldMaskPathsFromResolveInfo";

type FieldMaskExtensions = {
  fieldMask: { fieldName: string };
};

const getFieldName: GetFieldNameFunc = (field, _type, _schema) => {
  const ext = (field.extensions ?? {}) as Partial<FieldMaskExtensions>;
  return ext.fieldMask?.fieldName ?? null;
};

const object1Type = new GraphQLObjectType({
  name: "Object1",
  fields: {
    targetField: {
      type: GraphQLNonNull(GraphQLString),
      extensions: { fieldMask: { fieldName: "target_field" } } as FieldMaskExtensions,
    },
    ignoredField: {
      type: GraphQLNonNull(GraphQLString),
      resolve() {
        return "ignoredField";
      },
    },
  },
});

function createSchema({
  queryFields = {},
}: { queryFields?: GraphQLObjectTypeConfig<any, any>["fields"] } = {}): GraphQLSchema {
  const queryType = new GraphQLObjectType({
    name: "Query",
    fields: {
      object1: {
        type: object1Type,
        resolve(_source, _args, ctx, info) {
          return ctx.fetchObject1(fieldMaskPathsFromResolveInfo("Object1", info, { getFieldName }));
        },
      },
      ...queryFields,
    },
  });
  return new GraphQLSchema({ query: queryType });
}

test("simple case", async () => {
  const schema = createSchema();
  const fetchObject1 = jest.fn().mockReturnValue({ targetField: "targetField" });
  const result = await graphql(
    schema,
    `
      {
        object1 {
          targetField
          ignoredField
        }
      }
    `,
    undefined,
    { fetchObject1 }
  );

  expect(result).toMatchInlineSnapshot(`
Object {
  "data": Object {
    "object1": Object {
      "ignoredField": "ignoredField",
      "targetField": "targetField",
    },
  },
}
`);
  expect(fetchObject1.mock.calls[0][0]).toMatchInlineSnapshot(`
Array [
  "target_field",
]
`);
});

test("with fragment", async () => {
  const schema = createSchema();
  const fetchObject1 = jest.fn().mockReturnValue({ targetField: "targetField" });
  const result = await graphql(
    schema,
    `
      query {
        object1 {
          ...Object1
        }
      }
      fragment Object1 on Object1 {
        targetField
        ignoredField
      }
    `,
    undefined,
    { fetchObject1 }
  );

  expect(result).toMatchInlineSnapshot(`
Object {
  "data": Object {
    "object1": Object {
      "ignoredField": "ignoredField",
      "targetField": "targetField",
    },
  },
}
`);
  expect(fetchObject1.mock.calls[0][0]).toMatchInlineSnapshot(`
Array [
  "target_field",
]
`);
});

test("with inline fragment", async () => {
  const schema = createSchema();
  const fetchObject1 = jest.fn().mockReturnValue({ targetField: "targetField" });
  const result = await graphql(
    schema,
    `
      {
        object1 {
          ... on Object1 {
            targetField
            ignoredField
          }
        }
      }
    `,
    undefined,
    { fetchObject1 }
  );

  expect(result).toMatchInlineSnapshot(`
Object {
  "data": Object {
    "object1": Object {
      "ignoredField": "ignoredField",
      "targetField": "targetField",
    },
  },
}
`);
  expect(fetchObject1.mock.calls[0][0]).toMatchInlineSnapshot(`
Array [
  "target_field",
]
`);
});

test("with union", async () => {
  const unionType = new GraphQLUnionType({
    name: "UnionType",
    types: [object1Type],
  });
  const schema = createSchema({
    queryFields: {
      union: {
        type: unionType,
        resolve(_source, _args, ctx, info) {
          return ctx.fetchUnion(fieldMaskPathsFromResolveInfo("Object1", info, { getFieldName }));
        },
      },
    },
  });
  const fetchUnion = jest.fn().mockReturnValue({ __typename: "Object1", targetField: "targetField" });
  const result = await graphql(
    schema,
    `
      {
        union {
          ... on Object1 {
            targetField
            ignoredField
          }
        }
      }
    `,
    undefined,
    { fetchUnion }
  );

  expect(result).toMatchInlineSnapshot(`
Object {
  "data": Object {
    "union": Object {
      "ignoredField": "ignoredField",
      "targetField": "targetField",
    },
  },
}
`);
  expect(fetchUnion.mock.calls[0][0]).toMatchInlineSnapshot(`
Array [
  "target_field",
]
`);
});

test("with interface", async () => {
  const interfaceType = new GraphQLInterfaceType({
    name: "InterfaceType",
    resolveType() {
      return "Object1";
    },
    fields: {
      targetField: {
        type: GraphQLNonNull(GraphQLString),
      },
    },
  });
  let schema = createSchema({
    queryFields: {
      interface: {
        type: interfaceType,
        resolve(_source, _args, ctx, info) {
          return ctx.fetchInterface(fieldMaskPathsFromResolveInfo("Object1", info, { getFieldName }));
        },
      },
    },
  });
  schema = extendSchema(schema, parse(`extend type Object1 implements InterfaceType`));
  const fetchInterface = jest.fn().mockReturnValue({ targetField: "targetField" });
  const result = await graphql(
    schema,
    `
      {
        interface {
          ... on Object1 {
            targetField
            ignoredField
          }
        }
      }
    `,
    undefined,
    { fetchInterface }
  );

  expect(result).toMatchInlineSnapshot(`
Object {
  "data": Object {
    "interface": Object {
      "ignoredField": "ignoredField",
      "targetField": "targetField",
    },
  },
}
`);
  expect(fetchInterface.mock.calls[0][0]).toMatchInlineSnapshot(`
Array [
  "target_field",
]
`);
});

describe("with nested field", () => {
  test("simple case", async () => {
    const parentType = new GraphQLObjectType({
      name: "Parent",
      fields: {
        object1: {
          type: GraphQLNonNull(object1Type),
          extensions: { fieldMask: { fieldName: "object1" } } as FieldMaskExtensions,
        },
      },
    });
    const schema = createSchema({
      queryFields: {
        parent: {
          type: parentType,
          resolve(_source, _args, ctx, info) {
            return ctx.fetchParent(fieldMaskPathsFromResolveInfo("Parent", info, { getFieldName }));
          },
        },
      },
    });
    const fetchParent = jest.fn().mockReturnValue({ object1: { targetField: "targetField" } });
    const result = await graphql(
      schema,
      `
        {
          parent {
            object1 {
              targetField
              ignoredField
            }
          }
        }
      `,
      undefined,
      { fetchParent }
    );

    expect(result).toMatchInlineSnapshot(`
Object {
  "data": Object {
    "parent": Object {
      "object1": Object {
        "ignoredField": "ignoredField",
        "targetField": "targetField",
      },
    },
  },
}
`);
    expect(fetchParent.mock.calls[0][0]).toMatchInlineSnapshot(`
Array [
  "object1.target_field",
]
`);
  });

  test("with union", async () => {
    const childUnion = new GraphQLUnionType({
      name: "ChildUnion",
      types: [object1Type],
    });
    const parentType = new GraphQLObjectType({
      name: "Parent",
      fields: {
        childUnion: {
          type: GraphQLNonNull(childUnion),
          extensions: { fieldMask: { fieldName: "object1" } } as FieldMaskExtensions,
        },
      },
    });
    const schema = createSchema({
      queryFields: {
        parent: {
          type: parentType,
          resolve(_source, _args, ctx, info) {
            return ctx.fetchParent(fieldMaskPathsFromResolveInfo("Parent", info, { getFieldName }));
          },
        },
      },
    });
    const fetchParent = jest
      .fn()
      .mockReturnValue({ childUnion: { __typename: "Object1", targetField: "targetField" } });
    const result = await graphql(
      schema,
      `
        {
          parent {
            childUnion {
              ... on Object1 {
                targetField
                ignoredField
              }
            }
          }
        }
      `,
      undefined,
      { fetchParent }
    );

    expect(result).toMatchInlineSnapshot(`
Object {
  "data": Object {
    "parent": Object {
      "childUnion": Object {
        "ignoredField": "ignoredField",
        "targetField": "targetField",
      },
    },
  },
}
`);
    expect(fetchParent.mock.calls[0][0]).toMatchInlineSnapshot(`
Array [
  "object1.target_field",
]
`);
  });
});
