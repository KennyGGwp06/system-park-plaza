import { useState } from "react";
import { BookOpen, Search, Scale, AlertCircle } from "lucide-react";
import { useFetch } from "../../hooks/useFetch";
import { Input } from "../../components/ui/Input";

export function RestaurantRecipesPage() {
  const { data: recipesData, loading, error } = useFetch("/technical-recipes/manual/RESTAURANTE", {
    realtime: true,
    pollInterval: 15000
  });
  const [searchTerm, setSearchTerm] = useState("");

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando recetario...</div>;
  if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;

  const recipes = recipesData || [];
  const filteredRecipes = recipes.filter(r => 
    r.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-[#0f3d2e] flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-[#d4af37]" />
          Manual de Recetas
        </h1>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            type="text" 
            placeholder="Buscar por nombre o código..." 
            className="pl-9 bg-white border-gray-300"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {filteredRecipes.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No se encontraron recetas</h3>
          <p className="text-gray-500">No hay recetas técnicas activas que coincidan con tu búsqueda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecipes.map((recipe) => (
            <div key={recipe.id} className="border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full bg-white rounded-lg">
              <div className="bg-[#0f3d2e] text-white p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg text-white font-semibold line-clamp-2">{recipe.name}</h3>
                    <p className="text-sm text-[#d4af37] mt-1 font-medium">{recipe.code}</p>
                  </div>
                  <div className="bg-white/20 p-1.5 rounded flex items-center gap-1.5 text-xs font-medium">
                    <Scale className="h-3 w-3" />
                    {recipe.base_yield} {recipe.unit}
                  </div>
                </div>
              </div>
              <div className="p-0 flex-1 flex flex-col">
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex-1">
                  <h4 className="text-xs uppercase font-bold text-gray-500 tracking-wider mb-3">Ingredientes y Porciones</h4>
                  <ul className="space-y-2">
                    {recipe.ingredients?.map((ing, idx) => (
                      <li key={idx} className="flex justify-between items-center text-sm">
                        <span className="text-gray-700">{ing.product_name}</span>
                        <span className="font-semibold text-[#0f3d2e] bg-[#0f3d2e]/10 px-2 py-0.5 rounded">
                          {Number(ing.quantity).toFixed(2)} {ing.unit}
                        </span>
                      </li>
                    ))}
                    {(!recipe.ingredients || recipe.ingredients.length === 0) && (
                      <li className="text-sm text-gray-500 italic flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Sin ingredientes detallados
                      </li>
                    )}
                  </ul>
                </div>
                {recipe.instructions && (
                  <div className="p-4">
                    <h4 className="text-xs uppercase font-bold text-gray-500 tracking-wider mb-2">Instrucciones</h4>
                    <p className="text-sm text-gray-600 line-clamp-3">{recipe.instructions}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
