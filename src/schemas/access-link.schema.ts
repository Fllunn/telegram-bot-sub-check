import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AccessLinkDocument = AccessLink & Document;

@Schema({ timestamps: true })
export class AccessLink {
  @Prop({ required: true })
  url!: string;

  @Prop({ required: true })
  updatedBy!: number;
}

export const AccessLinkSchema = SchemaFactory.createForClass(AccessLink);
