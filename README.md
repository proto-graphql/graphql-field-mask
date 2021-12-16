# graphql-field-mask
[![CI](https://github.com/proto-graphql/graphql-field-mask/actions/workflows/ci.yml/badge.svg)](https://github.com/proto-graphql/graphql-field-mask/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/proto-graphql/graphql-field-mask/badge.svg?branch=main)](https://coveralls.io/github/proto-graphql/graphql-field-mask?branch=main)
[![npm](https://img.shields.io/npm/v/graphql-field-mask)](https://www.npmjs.com/package/graphql-field-mask)
[![LICENSE](https://img.shields.io/github/license/proto-graphql/graphql-field-mask)](./LICENSE)

`google.protobuf.FieldMask` from GraphQL query

## Usage

```ts
import { FieldMask } from "google-protobuf/google/protobuf/field_mask_pb";
import { fieldMaskPathsFromResolveInfo } from "graphql-field-mask";

const queryType = new GraphQLObjectType({
  name: "Query",
  fields: {
    viewer: {
      type: User,
      resolve(_source, _args, ctx, info) {
        const paths = fieldMaskPathsFromResolveInfo("User", info);
        const mask = new FieldMask().setPathsList(paths);

        // ...
      }
    }
  }
})
```

### Convert to snake case

```ts
import { snakeCase } from "change-case";
import { fieldMaskPathsFromResolveInfo, GetFieldNameFunc } from "graphql-field-mask";

const getFieldName: GetFieldNameFunc = ({ field }) => snakeCase(field.name);

resolve(_source, _args, ctx, info) {
  const paths = fieldMaskPathsFromResolveInfo("User", info, { getFieldName });
  const mask = new FieldMask().setPathsList(paths);

  // ...
}
```

### With custom scalar

```ts
import { getNamedType, isScalarType } from "graphql";
import { fieldMaskPathsFromResolveInfo, GetFieldNameFunc } from "graphql-field-mask";

const getFieldName: GetFieldNameFunc = ({ field }) => {
  const fieldType = getNamedType(field.type);
  if (isScalarType(fieldType)) {
    switch (fieldType.name) {
    case 'Date':
      return ['year', 'month', 'day'].map(c => `${fieldName}.${c}`);
    // ...
    }
  }
  return field.name
};

resolve(_source, _args, ctx, info) {
  const paths = fieldMaskPathsFromResolveInfo("User", info, { getCustomScalarFieldMaskPaths });
  const mask = new FieldMask().setPathsList(paths);

  // ...
}
```

### With [ProtoNexus](https://github.com/proto-graphql/proto-nexus)

```ts
import { ProtobufFieldExtensions, ProtobufMessageExtensions, ProtobufOneofExtensions } from "proto-nexus";
import { fieldMaskPathsFromResolveInfo, GetFieldNameFunc } from "graphql-field-mask";

const getFieldName: GetFieldNameFunc = ({ field }) => {
  const ext = (field.extensions ?? {}) as Partial<ProtobufFieldExtensions>;
  return ext.protobufField?.name  ?? null;
};

const getAbstractTypeFieldMaskPaths: GetAbstractTypeFieldMaskPathsFunc = (info, getFieldMaskPaths) => {
  const oneofExt = (info.abstractType.extensions ?? {}) as Partial<ProtobufOneofExtensions>;
  const objExt = (info.concreteType.extensions ?? {}) as Partial<ProtobufMessageExtensions>;
  const prefix = (oneofExt.protobufOneof.fields ?? []).find(f => f.type === objExt.protobufMessage?.fullName)?.name;
  return prefix ? getFieldMaskPaths().map(p => `${prefix}.${p}`) : []
}

resolve(_source, _args, ctx, info) {
  const paths = fieldMaskPathsFromResolveInfo("User", info, { getFieldName, getAbstractTypeFieldMaskPaths });
  const mask = new FieldMask().setPathsList(paths);

  // ...
}
```

## Author

- [Masayuki Izumi (@izumin5210)](https://github.com/izumin5210)
