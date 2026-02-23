import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BlogPost } from './entities/blog-post.entity';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { RoleModule } from '../role/role.module';

@Module({
  imports: [SequelizeModule.forFeature([BlogPost]), RoleModule],
  controllers: [BlogController],
  providers: [BlogService, CloudinaryService],
  exports: [BlogService],
})
export class BlogModule {}
