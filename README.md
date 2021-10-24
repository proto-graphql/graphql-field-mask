# graphql-field-mask
[![CI](https://github.com/izumin5210/graphql-field-mask/actions/workflows/ci.yml/badge.svg)](https://github.com/izumin5210/graphql-field-mask/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/izumin5210/graphql-field-mask/badge.svg?branch=main)](https://coveralls.io/github/izumin5210/graphql-field-mask?branch=main)
[![npm](https://img.shields.io/npm/v/graphql-field-mask)](https://www.npmjs.com/package/graphql-field-mask)
[![LICENSE](https://img.shields.io/github/license/izumin5210/graphql-field-mask)](./LICENSE)

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

const getFieldName: GetFieldNameFunc = (field, _type, _schema) => snakeCase(field.name);

resolve(_source, _args, ctx, info) {
  const paths = fieldMaskPathsFromResolveInfo("User", info, { getFieldName });
  const mask = new FieldMask().setPathsList(paths);

  // ...
}
```

### With [ProtoNexus](https://github.com/proto-graphql/proto-nexus)

```ts
import { ProtobufFieldExtensions } from "proto-nexus";
import { fieldMaskPathsFromResolveInfo, GetFieldNameFunc } from "graphql-field-mask";

const getFieldName: GetFieldNameFunc = (field, _type, _schema) => {
  const ext = (field.extensions ?? {}) as Partial<ProtobufFieldExtensions>;
  return ext.protobufField?.name  ?? null;
};

resolve(_source, _args, ctx, info) {
  const paths = fieldMaskPathsFromResolveInfo("User", info, { getFieldName });
  const mask = new FieldMask().setPathsList(paths);

  // ...
}
```
