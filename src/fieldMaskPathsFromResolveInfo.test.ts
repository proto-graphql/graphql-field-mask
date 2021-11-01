import {
  extendSchema,
  graphql,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLObjectTypeConfig,
  GraphQLSchema,
  GraphQLString,
  GraphQLUnionType,
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
      type: new GraphQLNonNull(GraphQLString),
      extensions: { fieldMask: { fieldName: "target_field" } } as FieldMaskExtensions,
    },
    otherField: {
      type: new GraphQLNonNull(GraphQLString),
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
          return ctx.fetchObject1(fieldMaskPathsFromResolveInfo("Object1", info));
        },
      },
      ...queryFields,
    },
  });
  return new GraphQLSchema({ query: queryType });
}

describe(fieldMaskPathsFromResolveInfo, () => {
  it("returns valid field mask paths", async () => {
    const schema = createSchema();
    const fetchObject1 = jest.fn().mockReturnValue({ targetField: "target field", otherField: "other field" });
    const result = await graphql({
      schema,
      source: "{ object1 { targetField, otherField } }",
      contextValue: { fetchObject1 },
    });

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ object1: { targetField: "target field", otherField: "other field" } });
    expect(fetchObject1.mock.calls[0][0]).toEqual(["targetField", "otherField"]);
  });

  describe("with getFieldName option", () => {
    it("returns a return value of getFieldName as a field mask path, but omit fields that getFieldName returned null", async () => {
      const schema = createSchema({
        queryFields: {
          object1: {
            type: object1Type,
            resolve(_source, _args, ctx, info) {
              return ctx.fetchObject1(fieldMaskPathsFromResolveInfo("Object1", info, { getFieldName }));
            },
          },
        },
      });
      const fetchObject1 = jest.fn().mockReturnValue({ targetField: "target field", otherField: "other field" });
      const result = await graphql({
        schema,
        source: "{ object1 { targetField, otherField } }",
        contextValue: { fetchObject1 },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ object1: { targetField: "target field", otherField: "other field" } });
      expect(fetchObject1.mock.calls[0][0]).toEqual(["target_field"]);
    });
  });

  describe("with field alias", () => {
    it("returns an original field name as a field mask path", async () => {
      const schema = createSchema();
      const fetchObject1 = jest.fn().mockReturnValue({ targetField: "target field" });
      const result = await graphql({
        schema,
        source: "{ object1 { aliasedField: targetField } }",
        contextValue: { fetchObject1 },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ object1: { aliasedField: "target field" } });
      expect(fetchObject1.mock.calls[0][0]).toEqual(["targetField"]);
    });
  });

  describe("with __typename", () => {
    it("returns field mask paths without __typename", async () => {
      const schema = createSchema();
      const fetchObject1 = jest.fn().mockReturnValue({ targetField: "target field" });
      const result = await graphql({
        schema,
        source: "{ object1 { __typename, targetField } }",
        contextValue: { fetchObject1 },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ object1: { __typename: "Object1", targetField: "target field" } });
      expect(fetchObject1.mock.calls[0][0]).toEqual(["targetField"]);
    });
  });

  describe("with fragment", () => {
    it("also includes fiels in fragments", async () => {
      const schema = createSchema();
      const fetchObject1 = jest.fn().mockReturnValue({ targetField: "target field", otherField: "other field" });
      const result = await graphql({
        schema,
        source: `
          query {
            object1 {
              ...Object1
              otherField
            }
          }
          fragment Object1 on Object1 {
            targetField
          }
        `,
        contextValue: { fetchObject1 },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ object1: { targetField: "target field", otherField: "other field" } });
      expect(fetchObject1.mock.calls[0][0]).toEqual(["targetField", "otherField"]);
    });
  });

  describe("with inilne fragment", () => {
    it("also includes fiels in inline fragments", async () => {
      const schema = createSchema();
      const fetchObject1 = jest.fn().mockReturnValue({ targetField: "target field", otherField: "other field" });
      const result = await graphql({
        schema,
        source: `
          query {
            object1 {
              ... on Object1 {
                targetField
              }
              otherField
            }
          }
        `,
        contextValue: { fetchObject1 },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ object1: { targetField: "target field", otherField: "other field" } });
      expect(fetchObject1.mock.calls[0][0]).toEqual(["targetField", "otherField"]);
    });
  });

  describe("with inilne fragment without type conditions", () => {
    it("also includes fiels in inline fragments", async () => {
      const schema = createSchema();
      const fetchObject1 = jest.fn().mockReturnValue({ targetField: "target field", otherField: "other field" });
      const result = await graphql({
        schema,
        source: `
          query {
            object1 {
              ... {
                targetField
              }
              otherField
            }
          }
        `,
        contextValue: { fetchObject1 },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ object1: { targetField: "target field", otherField: "other field" } });
      expect(fetchObject1.mock.calls[0][0]).toEqual(["targetField", "otherField"]);
    });
  });

  describe("with nested object", () => {
    it("returns nested field paths with parent path", async () => {
      const parentType = new GraphQLObjectType({
        name: "Parent",
        fields: {
          parentField: { type: GraphQLInt },
          object1: { type: new GraphQLNonNull(object1Type) },
        },
      });
      const schema = createSchema({
        queryFields: {
          parent: {
            type: parentType,
            resolve(_source, _args, ctx, info) {
              return ctx.fetchParent(fieldMaskPathsFromResolveInfo("Parent", info));
            },
          },
        },
      });
      const fetchParent = jest
        .fn()
        .mockReturnValue({ parentField: 1, object1: { targetField: "target field", otherField: "other field" } });
      const result = await graphql({
        schema,
        source: "{ parent { parentField, object1 { targetField, otherField } } }",
        contextValue: { fetchParent },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({
        parent: { parentField: 1, object1: { otherField: "other field", targetField: "target field" } },
      });
      expect(fetchParent.mock.calls[0][0]).toEqual(["parentField", "object1.targetField", "object1.otherField"]);
    });
  });

  describe("with custom scalar", () => {
    it("returns field mask paths with getCustomScalarFieldMaskPath result", async () => {
      let schema = createSchema({
        queryFields: {
          object1: {
            type: object1Type,
            resolve(_source, _args, ctx, info) {
              return ctx.fetchObject1(
                fieldMaskPathsFromResolveInfo("Object1", info, {
                  getCustomScalarFieldMaskPaths: (path, info) => {
                    if (info.type.name === "Date") return ["year", "month", "day"].map((c) => `${path}.${c}`);
                    throw new Error(`unkonwn scalar type: ${info.type.name}`);
                  },
                })
              );
            },
          },
        },
      });
      schema = extendSchema(
        schema,
        parse(`
          scalar Date
          extend type Object1 { date: Date! }
        `)
      );
      const fetchObject1 = jest
        .fn()
        .mockReturnValue({ targetField: "target field", otherField: "other field", date: "2021-11-01" });
      const result = await graphql({
        schema,
        source: `query { object1 { targetField, otherField, date } }`,
        contextValue: { fetchObject1 },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({
        object1: { targetField: "target field", otherField: "other field", date: "2021-11-01" },
      });
      expect(fetchObject1.mock.calls[0][0]).toEqual([
        "targetField",
        "otherField",
        "date.year",
        "date.month",
        "date.day",
      ]);
    });
  });

  describe("with union type", () => {
    const object2Type = new GraphQLObjectType({ name: "Object2", fields: { field2: { type: GraphQLString } } });
    const unionType = new GraphQLUnionType({ name: "UnionType", types: [object1Type, object2Type] });
    it("returns only specified object's fields", async () => {
      const schema = createSchema({
        queryFields: {
          union: {
            type: unionType,
            resolve(_source, _args, ctx, info) {
              return ctx.fetchUnion({
                object1: fieldMaskPathsFromResolveInfo("Object1", info),
                object2: fieldMaskPathsFromResolveInfo("Object2", info),
              });
            },
          },
        },
      });
      const fetchUnion = jest
        .fn()
        .mockReturnValue({ __typename: "Object1", targetField: "target field", otherField: "other field" });
      const result = await graphql({
        schema,
        source: `
          {
            union {
              ... on Object1 {
                targetField
                otherField
              }
              ...Object2
            }
          }
          fragment Object2 on Object2 {
            field2
          }
        `,
        contextValue: { fetchUnion },
      });
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ union: { otherField: "other field", targetField: "target field" } });
      expect(fetchUnion.mock.calls[0][0].object1).toEqual(["targetField", "otherField"]);
      expect(fetchUnion.mock.calls[0][0].object2).toEqual(["field2"]);
    });

    it("returns field mask paths with object fragment fiels inside union fragment", async () => {
      const schema = createSchema({
        queryFields: {
          union: {
            type: unionType,
            resolve(_source, _args, ctx, info) {
              return ctx.fetchUnion({
                object1: fieldMaskPathsFromResolveInfo("Object1", info),
                object2: fieldMaskPathsFromResolveInfo("Object2", info),
              });
            },
          },
        },
      });
      const fetchUnion = jest
        .fn()
        .mockReturnValue({ __typename: "Object1", targetField: "target field", otherField: "other field" });
      const query = `#graphql
        { union { ...Union } }
        fragment Union on UnionType { ...Object1, ...Object2 }
        fragment Object1 on Object1 { targetField, otherField }
        fragment Object2 on Object2 { field2 }
      `;
      const result = await graphql({ schema, source: query, contextValue: { fetchUnion } });
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ union: { otherField: "other field", targetField: "target field" } });
      expect(fetchUnion.mock.calls[0][0].object1).toEqual(["targetField", "otherField"]);
      expect(fetchUnion.mock.calls[0][0].object2).toEqual(["field2"]);
    });
  });

  describe("with nested union type", () => {
    const object2Type = new GraphQLObjectType({ name: "Object2", fields: { field2: { type: GraphQLString } } });
    const unionType = new GraphQLUnionType({
      name: "UnionType",
      types: [object1Type, object2Type],
    });
    const parentType = new GraphQLObjectType({
      name: "Parent",
      fields: {
        union: {
          type: new GraphQLNonNull(unionType),
          extensions: { fieldMaskPathPrefix: { Object1: "object1", Object2: "object2" } },
        },
      },
    });
    const query = `#graphql
      {
        parent {
          union {
            ... on Object1 {
              targetField
              otherField
            }
            ...Object2
          }
        }
      }
      fragment Object2 on Object2 {
        field2
      }
    `;

    it("returns field mask paths without union member type fields", async () => {
      const schema = createSchema({
        queryFields: {
          parent: {
            type: parentType,
            resolve(_source, _args, ctx, info) {
              return ctx.fetchParent(fieldMaskPathsFromResolveInfo("Parent", info));
            },
          },
        },
      });
      const fetchParent = jest
        .fn()
        .mockReturnValue({ union: { __typename: "Object1", targetField: "target field", otherField: "other field" } });
      const result = await graphql({ schema, source: query, contextValue: { fetchParent } });
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ parent: { union: { otherField: "other field", targetField: "target field" } } });
      expect(fetchParent.mock.calls[0][0]).toEqual([]);
    });

    it("returns field mask path with getAbstractTypeFieldMaskPaths result", async () => {
      const schema = createSchema({
        queryFields: {
          parent: {
            type: parentType,
            resolve(_source, _args, ctx, info) {
              return ctx.fetchParent(
                fieldMaskPathsFromResolveInfo("Parent", info, {
                  getAbstractTypeFieldMaskPaths: (info, getFieldMaskPaths) => {
                    // eslint-disable-next-line dot-notation
                    const prefix = (info.field.extensions as any)?.["fieldMaskPathPrefix"][info.concreteType.name];
                    return getFieldMaskPaths().map((p) => `${prefix}.${p}`);
                  },
                })
              );
            },
          },
        },
      });
      const fetchParent = jest
        .fn()
        .mockReturnValue({ union: { __typename: "Object1", targetField: "target field", otherField: "other field" } });
      const result = await graphql({ schema, source: query, contextValue: { fetchParent } });
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ parent: { union: { otherField: "other field", targetField: "target field" } } });
      expect(fetchParent.mock.calls[0][0]).toEqual([
        "union.object1.targetField",
        "union.object1.otherField",
        "union.object2.field2",
      ]);
    });

    it("returns field mask paths with fields inside union fragment ", async () => {
      const query = `#graphql
        query { parent { union { ...UnionType } } }
        fragment UnionType on UnionType {
          ... on Object1 { targetField, otherField }
          ... on Object2 { field2 }
        }
      `;
      const schema = createSchema({
        queryFields: {
          parent: {
            type: parentType,
            resolve(_source, _args, ctx, info) {
              return ctx.fetchParent(
                fieldMaskPathsFromResolveInfo("Parent", info, {
                  getAbstractTypeFieldMaskPaths: (info, getFieldMaskPaths) => {
                    // eslint-disable-next-line dot-notation
                    const prefix = (info.field.extensions as any)?.["fieldMaskPathPrefix"][info.concreteType.name];
                    return getFieldMaskPaths().map((p) => `${prefix}.${p}`);
                  },
                })
              );
            },
          },
        },
      });
      const fetchParent = jest
        .fn()
        .mockReturnValue({ union: { __typename: "Object1", targetField: "target field", otherField: "other field" } });
      const result = await graphql({ schema, source: query, contextValue: { fetchParent } });
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ parent: { union: { otherField: "other field", targetField: "target field" } } });
      expect(fetchParent.mock.calls[0][0]).toEqual([
        "union.object1.targetField",
        "union.object1.otherField",
        "union.object2.field2",
      ]);
    });
  });

  describe("when fetch outside of query resolvers", () => {
    it("returns valid mask paths", async () => {
      const parentType = new GraphQLObjectType({
        name: "Parent",
        fields: {
          object1: {
            type: new GraphQLNonNull(object1Type),
            resolve(_source, _args, ctx, info) {
              return ctx.fetchObject1(fieldMaskPathsFromResolveInfo("Object1", info));
            },
          },
        },
      });
      const schema = createSchema({
        queryFields: {
          parent: {
            type: parentType,
            resolve(_source, _args, _ctx, _info) {
              return {};
            },
          },
        },
      });
      const fetchObject1 = jest.fn().mockReturnValue({ targetField: "target field", otherField: "other field" });
      const result = await graphql({
        schema,
        source: "{ parent { object1 { targetField otherField } } }",
        contextValue: { fetchObject1 },
      });
      expect(result.errors).toBeUndefined();
      expect(result.data).toEqual({ parent: { object1: { otherField: "other field", targetField: "target field" } } });
      expect(fetchObject1.mock.calls[0][0]).toEqual(["targetField", "otherField"]);
    });
  });

  it("throws an error when invalid typename is passed", async () => {
    const schema = createSchema({
      queryFields: {
        object1: {
          type: object1Type,
          resolve(_source, _args, ctx, info) {
            return ctx.fetchObject1(fieldMaskPathsFromResolveInfo("Object11111", info));
          },
        },
      },
    });
    const fetchObject1 = jest.fn().mockReturnValue({ targetField: "target field", otherField: "other field" });
    const result = await graphql({
      schema,
      source: "{ object1 { targetField, otherField } }",
      contextValue: { fetchObject1 },
    });

    expect(result.errors).toHaveLength(1);
  });
});
