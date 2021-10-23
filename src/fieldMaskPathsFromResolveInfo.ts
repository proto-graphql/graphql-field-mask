import {
  FieldNode,
  FragmentDefinitionNode,
  getNamedType,
  GraphQLField,
  GraphQLObjectType,
  GraphQLResolveInfo,
  GraphQLSchema,
  InlineFragmentNode,
} from "graphql";

export type GetFieldNameFunc = (
  field: GraphQLField<any, any>,
  type: GraphQLObjectType,
  schema: GraphQLSchema
) => string | null;

export type FieldMaskPathsFromResolveInfoOptions = {
  getFieldName?: GetFieldNameFunc;
};

export function fieldMaskPathsFromResolveInfo(
  typename: string,
  info: GraphQLResolveInfo,
  opts: FieldMaskPathsFromResolveInfoOptions = {}
) {
  return fieldMaskPaths(typename, [...info.fieldNodes], info.fragments, info.schema, opts);
}

function fieldMaskPaths(
  typename: string,
  node:
    | FieldNode
    | FragmentDefinitionNode
    | InlineFragmentNode
    | FieldNode[]
    | FragmentDefinitionNode[]
    | InlineFragmentNode[],
  fragments: GraphQLResolveInfo["fragments"],
  schema: GraphQLSchema,
  opts: FieldMaskPathsFromResolveInfoOptions
): string[] {
  let fields: string[] = [];

  if (Array.isArray(node)) {
    for (const v of node) {
      const res = fieldMaskPaths(typename, v, fragments, schema, opts);
      fields = [...fields, ...res];
    }
  } else {
    if (!node.selectionSet) {
      return [];
    }

    fields = extractFieldsFromGraphqlAst(typename, node, fragments, schema, opts);
  }

  return Array.from(new Set(fields));
}

function extractFieldsFromGraphqlAst(
  typename: string,
  node: FieldNode | FragmentDefinitionNode | InlineFragmentNode,
  fragments: GraphQLResolveInfo["fragments"],
  schema: GraphQLSchema,
  opts: FieldMaskPathsFromResolveInfoOptions
): string[] {
  if (!node.selectionSet) {
    return [];
  }

  let fields: string[] = [];

  for (const selection of node.selectionSet.selections) {
    switch (selection.kind) {
      case "Field": {
        if (selection.name.value === "__typename") break;

        const type = getObjectType(typename, schema);
        const field = type.getFields()[selection.name.value];
        if (field == null) {
          throw new Error(`${typename}.${selection.name.value} is not found`);
        }
        const fieldName = opts.getFieldName ? opts.getFieldName(field, type, schema) : field.name;
        if (fieldName == null) {
          break;
        }
        if (selection.selectionSet) {
          const childTypename = getNamedType(field.type).name;
          const childFields = extractFieldsFromGraphqlAst(childTypename, selection, fragments, schema, opts);
          fields = [...fields, ...childFields.map((field) => `${fieldName}.${field}`)];
        } else {
          fields = [...fields, fieldName];
        }
        break;
      }
      case "FragmentSpread": {
        const fragmentName = selection.name.value;
        const fragment = fragments[fragmentName];
        if (fragment == null) {
          throw new Error(`Fragment ${fragmentName} is not found`);
        }
        const childTypename = fragment.typeCondition.name.value;
        const childFields = extractFieldsFromGraphqlAst(childTypename, fragment, fragments, schema, opts);
        fields = [...fields, ...childFields];
        break;
      }
      case "InlineFragment": {
        const childTypename = selection.typeCondition ? selection.typeCondition.name.value : typename;
        const childFields = extractFieldsFromGraphqlAst(childTypename, selection, fragments, schema, opts);
        fields = [...fields, ...childFields];
        break;
      }
    }
  }
  return fields;
}

function getObjectType(name: string, schema: GraphQLSchema): GraphQLObjectType {
  const foundType = schema.getType(name);
  if (foundType == null) {
    throw new Error(`${name} type is not found`);
  }
  if (!(foundType instanceof GraphQLObjectType)) {
    throw new Error(`${name} is ${foundType.astNode?.kind}, but want ObjectType`);
  }
  return foundType;
}
