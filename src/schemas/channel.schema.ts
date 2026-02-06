import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChannelDocument = Channel & Document;

@Schema({ timestamps: true })
export class Channel {
  @Prop({ required: true, unique: true })
  channelId!: string;

  @Prop({ required: true })
  addedBy!: number;
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
