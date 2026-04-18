import { WishlistItemType } from '@/lib/types'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Coins, Edit, Trash2, Gift, MoreVertical, Archive, ArchiveRestore } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import DrawingDisplay from './DrawingDisplay'

interface WishlistItemProps {
  item: WishlistItemType
  onEdit: () => void
  onDelete: () => void
  onRedeem: () => void
  onArchive: () => void
  onUnarchive: () => void
  canRedeem: boolean
  isHighlighted?: boolean
  isRecentlyRedeemed?: boolean
  isArchived?: boolean
}

export default function WishlistItem({
  item,
  onEdit,
  onDelete,
  onRedeem,
  onArchive,
  onUnarchive,
  canRedeem,
  isHighlighted,
  isRecentlyRedeemed
}: WishlistItemProps) {
  const t = useTranslations('WishlistItem')
  const canWrite = true
  const canInteract = true


  return (
    <Card
      id={`wishlist-${item.id}`}
      className={`h-full flex flex-col transition-all duration-500 ${isHighlighted ? 'bg-yellow-100 dark:bg-yellow-900' : ''
        } ${isRecentlyRedeemed ? 'animate-[celebrate_1s_ease-in-out] shadow-lg ring-2 ring-primary' : ''
        } ${item.archived ? 'opacity-75' : ''}`}
    >
      <CardHeader className="flex-shrink-0">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <CardTitle className={`line-clamp-1 ${item.archived ? 'text-gray-400 dark:text-gray-500' : ''}`}>
              {item.name}
            </CardTitle>
            {item.targetCompletions && (
              <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">
                ({item.targetCompletions === 1 ? t('usesLeftSingular') : t('usesLeftPlural', { count: item.targetCompletions })})
              </span>
            )}
          </div>
        </div>
        {(item.description || item.drawing) && (
          <div className={`flex gap-4 mt-2 ${!item.description ? 'justify-end' : ''}`}>
            {item.description && (
              <CardDescription className={`whitespace-pre-line flex-1 min-w-0 break-words ${item.archived ? 'text-gray-400 dark:text-gray-500' : ''}`}>
                {item.description}
              </CardDescription>
            )}
            {item.drawing && (
              <div className="flex-shrink-0">
                <DrawingDisplay 
                  drawingData={item.drawing} 
                  width={120} 
                  height={80}
                  className=""
                />
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-end">
        <div className="mt-auto">
          <div className="flex items-center gap-2">
            <Coins className={`h-4 w-4 ${item.archived ? 'text-gray-400 dark:text-gray-500' : 'text-yellow-400'}`} />
            <span className={`text-sm font-medium ${item.archived ? 'text-gray-400 dark:text-gray-500' : ''}`}>
              {item.coinCost} {t('coinsSuffix')}
            </span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex-shrink-0 flex justify-between gap-2">
        <div className="flex gap-2">
          <Button
            variant={canRedeem ? "default" : "secondary"}
            size="sm"
            onClick={onRedeem}
            disabled={!canRedeem || !canInteract || item.archived}
            className={`transition-all duration-300 w-24 sm:w-auto ${isRecentlyRedeemed ? 'bg-green-500 hover:bg-green-600' : ''} ${item.archived ? 'cursor-not-allowed' : ''}`}
          >
            <Gift className={`h-4 w-4 sm:mr-2 ${isRecentlyRedeemed ? 'animate-spin' : ''}`} />
            <span>
              {isRecentlyRedeemed ? (
                <>
                  <span className="sm:hidden">{t('redeemedDone')}</span>
                  <span className="hidden sm:inline">{t('redeemedExclamation')}</span>
                </>
              ) : (
                <>
                  <span className="sm:hidden">{t('redeem')}</span>
                  <span className="hidden sm:inline">{t('redeem')}</span>
                </>
              )}
            </span>
          </Button>
        </div>
        <div className="flex gap-2">
          {!item.archived && (
            <Button
              variant="edit"
              size="sm"
              onClick={onEdit}
              disabled={!canWrite}
              className="hidden sm:flex"
            >
              <Edit className="h-4 w-4" />
              <span className="ml-2">{t('editButton')}</span>
            </Button>
          )}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!item.archived && (
                <DropdownMenuItem disabled={!canWrite} onClick={onArchive}>
                  <Archive className="mr-2 h-4 w-4" />
                  <span>{t('archiveButton')}</span>
                </DropdownMenuItem>
              )}
              {item.archived && (
                <DropdownMenuItem disabled={!canWrite} onClick={onUnarchive}>
                  <ArchiveRestore className="mr-2 h-4 w-4" />
                  <span>{t('unarchiveButton')}</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onEdit} className="sm:hidden">
                <Edit className="mr-2 h-4 w-4" />
                {t('editButton')}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="sm:hidden" />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                onClick={onDelete}
                disabled={!canWrite}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('deleteButton')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardFooter>
    </Card>
  )
}
