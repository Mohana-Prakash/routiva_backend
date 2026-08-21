import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { categoriesController } from './categories.controller';
import {
  categoryIdParamSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from './categories.validation';

export const categoriesRouter = Router();

categoriesRouter.use(requireAuth());

categoriesRouter.get('/', validate({ query: listCategoriesQuerySchema }), asyncHandler(categoriesController.list));
categoriesRouter.post('/', validate({ body: createCategorySchema }), asyncHandler(categoriesController.create));
categoriesRouter.patch(
  '/:id',
  validate({ params: categoryIdParamSchema, body: updateCategorySchema }),
  asyncHandler(categoriesController.update),
);
categoriesRouter.delete('/:id', validate({ params: categoryIdParamSchema }), asyncHandler(categoriesController.remove));
