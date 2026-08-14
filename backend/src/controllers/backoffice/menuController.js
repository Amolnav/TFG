const prisma = require('../../config/database');
const { asyncHandler, ValidationError } = require('../../middleware/errorHandler');

/**
 * GET /api/backoffice/menu/categories
 * List all menu categories with their items
 */
exports.getAllCategories = asyncHandler(async (req, res) => {
  const categories = await prisma.menuCategory.findMany({
    include: {
      items: {
        orderBy: { displayOrder: 'asc' }
      }
    },
    orderBy: { displayOrder: 'asc' }
  });

  res.json({
    status: 'success',
    data: { categories }
  });
});

/**
 * POST /api/backoffice/menu/categories
 */
exports.createCategory = asyncHandler(async (req, res) => {
  const { name, description, isActive, displayOrder } = req.body;

  // BUG-31: 400 claro en vez de error de Prisma → 500
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('El nombre de la categoría es obligatorio');
  }

  const newCategory = await prisma.menuCategory.create({
    data: {
      name,
      description,
      isActive: isActive !== undefined ? isActive : true,
      displayOrder: displayOrder || 0
    }
  });
  res.status(201).json({ status: 'success', data: newCategory });
});

/**
 * PUT /api/backoffice/menu/categories/:id
 */
exports.updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, isActive, displayOrder } = req.body;
  
  const updatedCategory = await prisma.menuCategory.update({
    where: { id: parseInt(id, 10) },
    data: { name, description, isActive, displayOrder }
  });
  res.json({ status: 'success', data: updatedCategory });
});

/**
 * DELETE /api/backoffice/menu/categories/:id
 */
exports.deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await prisma.menuCategory.delete({
    where: { id: parseInt(id, 10) }
  });
  res.json({ status: 'success', data: null, message: 'Categoría eliminada' });
});

// N3.3: valida los alérgenos contra los 14 UE y la foto como URL/ruta
const { EU_ALLERGENS } = require('../../config/constants');

function validateItemAllergens(allergens) {
  if (allergens === undefined) return undefined;
  if (!Array.isArray(allergens)) {
    throw new ValidationError('allergens debe ser un array');
  }
  const invalid = allergens.filter((a) => !EU_ALLERGENS.includes(a));
  if (invalid.length > 0) {
    throw new ValidationError(
      `Alérgenos no válidos: ${invalid.join(', ')}. Permitidos: ${EU_ALLERGENS.join(', ')}`
    );
  }
  return [...new Set(allergens)];
}

function validateItemPhotoUrl(photoUrl) {
  if (photoUrl === undefined) return undefined;
  if (photoUrl === null || photoUrl === '') return null;
  if (typeof photoUrl !== 'string' || !/^(https?:\/\/|\/)/.test(photoUrl)) {
    throw new ValidationError('photoUrl debe ser una URL http(s) o una ruta local (/branding/...)');
  }
  return photoUrl;
}

/**
 * POST /api/backoffice/menu/items
 */
exports.createItem = asyncHandler(async (req, res) => {
  const { name, description, price, isActive, displayOrder, categoryId, allergens, photoUrl } = req.body;

  // BUG-31: validar antes de llegar a Prisma
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ValidationError('El nombre del plato es obligatorio');
  }
  const parsedCategoryId = parseInt(categoryId, 10);
  if (!Number.isInteger(parsedCategoryId)) {
    throw new ValidationError('categoryId debe ser un número entero válido');
  }
  const validAllergens = validateItemAllergens(allergens);
  const validPhotoUrl = validateItemPhotoUrl(photoUrl);

  const newItem = await prisma.menuItem.create({
    data: {
      name,
      description,
      price,
      isActive: isActive !== undefined ? isActive : true,
      displayOrder: displayOrder || 0,
      categoryId: parsedCategoryId,
      ...(validAllergens !== undefined ? { allergens: validAllergens } : {}),
      ...(validPhotoUrl !== undefined ? { photoUrl: validPhotoUrl } : {})
    }
  });
  res.status(201).json({ status: 'success', data: newItem });
});

/**
 * PUT /api/backoffice/menu/items/:id
 */
exports.updateItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, price, isActive, displayOrder, categoryId, allergens, photoUrl } = req.body;

  const data = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (price !== undefined) data.price = price;
  if (isActive !== undefined) data.isActive = isActive;
  if (displayOrder !== undefined) data.displayOrder = displayOrder;
  if (categoryId !== undefined) data.categoryId = parseInt(categoryId, 10);
  // N3.3
  const validAllergens = validateItemAllergens(allergens);
  if (validAllergens !== undefined) data.allergens = validAllergens;
  const validPhotoUrl = validateItemPhotoUrl(photoUrl);
  if (validPhotoUrl !== undefined) data.photoUrl = validPhotoUrl;

  const updatedItem = await prisma.menuItem.update({
    where: { id: parseInt(id, 10) },
    data
  });
  res.json({ status: 'success', data: updatedItem });
});

/**
 * DELETE /api/backoffice/menu/items/:id
 */
exports.deleteItem = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await prisma.menuItem.delete({
    where: { id: parseInt(id, 10) }
  });
  res.json({ status: 'success', data: null, message: 'Ítem eliminado' });
});

/**
 * POST /api/backoffice/menu/categories/reorder
 * Reordena las categorías basándose en un array de IDs
 */
exports.reorderCategories = asyncHandler(async (req, res) => {
  const { ids } = req.body; // Array de IDs en el nuevo orden [4, 1, 3...]

  if (!Array.isArray(ids)) {
    return res.status(400).json({ status: 'error', message: 'Se requiere un array de IDs' });
  }

  // Actualizar el displayOrder de cada categoría en el array
  await Promise.all(
    ids.map((id, index) =>
      prisma.menuCategory.update({
        where: { id: parseInt(id, 10) },
        data: { displayOrder: index }
      })
    )
  );

  res.json({ status: 'success', message: 'Orden de categorías actualizado' });
});

module.exports = exports;
