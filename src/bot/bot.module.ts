import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Channel, ChannelSchema } from '../schemas/channel.schema';
import { AccessLink, AccessLinkSchema } from '../schemas/access-link.schema';
import { BotService } from './bot.service';
import { SubscriptionService } from './subscription.service';
import { CommandsHandler } from './commands.handler';
import { AdminHandler } from './admin.handler';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Channel.name, schema: ChannelSchema },
      { name: AccessLink.name, schema: AccessLinkSchema },
    ]),
  ],
  providers: [
    BotService,
    SubscriptionService,
    CommandsHandler,
    AdminHandler,
  ],
  exports: [BotService, SubscriptionService],
})
export class BotModule {}
